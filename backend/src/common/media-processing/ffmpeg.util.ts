import { spawn } from 'node:child_process';

export interface VideoProbe {
  width: number;
  height: number;
  fps: number;
}

/** Reads width/height/fps via ffprobe. Requires ffmpeg+ffprobe on PATH. */
export function probeVideo(inputPath: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate',
      '-of', 'json',
      inputPath,
    ]);

    let stdout = '';
    let stderr = '';
    ffprobe.stdout.on('data', (chunk) => (stdout += chunk));
    ffprobe.stderr.on('data', (chunk) => (stderr += chunk));
    ffprobe.on('error', reject);
    ffprobe.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr}`));
      const parsed = JSON.parse(stdout) as { streams: Array<{ width: number; height: number; r_frame_rate: string }> };
      const stream = parsed.streams[0];
      if (!stream) return reject(new Error('ffprobe found no video stream'));
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      resolve({ width: stream.width, height: stream.height, fps: den ? num / den : num });
    });
  });
}

/**
 * Decodes `inputPath` to raw RGB24 frames (one Buffer of width*height*3 bytes
 * each) at the given dimensions, calling `onFrame` as each frame arrives.
 * Resolves once ffmpeg exits.
 */
export function decodeFramesRgb24(
  inputPath: string,
  { width, height }: { width: number; height: number },
  onFrame: (frame: Buffer) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const frameSize = width * height * 3;
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', `scale=${width}:${height}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-',
    ]);

    let pending: Buffer<ArrayBuffer> = Buffer.alloc(0);
    let stderr = '';
    let onFrameError: unknown;

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      pending = pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, chunk]);
      while (pending.length >= frameSize) {
        const frame = pending.subarray(0, frameSize);
        pending = pending.subarray(frameSize);
        try {
          const result = onFrame(Buffer.from(frame));
          if (result instanceof Promise) {
            ffmpeg.stdout.pause();
            result
              .then(() => ffmpeg.stdout.resume())
              .catch((error) => {
                onFrameError = error;
                ffmpeg.kill();
              });
          }
        } catch (error) {
          onFrameError = error;
          ffmpeg.kill();
        }
      }
    });
    ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (onFrameError) return reject(onFrameError);
      if (code !== 0 && code !== null) return reject(new Error(`ffmpeg decode failed: ${stderr.slice(-800)}`));
      resolve();
    });
  });
}

/**
 * Encodes a stream of raw BGRA frames (fed via the returned `write`/`end`)
 * plus the original file's audio track into a QuickTime Animation (.mov)
 * with a real alpha channel at `outputPath`.
 */
export function createAlphaMovEncoder(
  sourceAudioPath: string,
  outputPath: string,
  { width, height, fps }: { width: number; height: number; fps: number },
): { write: (frame: Buffer) => Promise<void>; end: () => Promise<void> } {
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'bgra',
    '-s', `${width}x${height}`, '-r', String(fps),
    '-i', '-',
    '-i', sourceAudioPath,
    '-map', '0:v', '-map', '1:a?',
    '-c:v', 'qtrle', '-c:a', 'aac', '-shortest',
    outputPath,
  ]);

  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
  ffmpeg.stdin.on('error', () => {}); // see createMp4Encoder's comment on EPIPE

  const exit = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg encode failed: ${stderr.slice(-800)}`));
      resolve();
    });
  });

  return {
    // Respects ffmpeg stdin backpressure: write() resolves only once ffmpeg
    // has drained its buffer, so a slow encoder can't let frames pile up
    // unbounded in Node's memory (that's what hung the machine before this
    // fix — libx264 at 1080x1920 was far slower than the compositor).
    write: (frame: Buffer) =>
      new Promise<void>((resolve) => {
        if (ffmpeg.stdin.destroyed || !ffmpeg.stdin.writable) return resolve();
        if (ffmpeg.stdin.write(frame)) resolve();
        else ffmpeg.stdin.once('drain', resolve);
      }),
    end: async () => {
      if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.end();
      await exit;
    },
  };
}

/**
 * Encodes a stream of raw RGBA frames (fed via the returned `write`/`end`)
 * plus a pre-built audio file into a playable .mp4.
 */
export function createMp4Encoder(
  audioPath: string | null,
  outputPath: string,
  { width, height, fps }: { width: number; height: number; fps: number },
): { write: (frame: Buffer) => Promise<void>; end: () => Promise<void> } {
  const args = [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`, '-r', String(fps),
    '-i', '-',
    ...(audioPath ? ['-i', audioPath, '-map', '0:v', '-map', '1:a', '-shortest'] : ['-map', '0:v']),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    ...(audioPath ? ['-c:a', 'aac'] : []),
    outputPath,
  ];
  const ffmpeg = spawn('ffmpeg', args);

  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
  // If ffmpeg exits/crashes while we're still writing, further stdin writes
  // raise EPIPE as an unhandled 'error' event that would otherwise crash the
  // whole process — swallow it here, `exit` below already carries the real
  // failure reason from ffmpeg's stderr.
  ffmpeg.stdin.on('error', () => {});

  const exit = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg encode failed: ${stderr.slice(-800)}`));
      resolve();
    });
  });

  return {
    write: (frame: Buffer) =>
      new Promise<void>((resolve) => {
        if (ffmpeg.stdin.destroyed || !ffmpeg.stdin.writable) return resolve();
        if (ffmpeg.stdin.write(frame)) resolve();
        else ffmpeg.stdin.once('drain', resolve);
      }),
    end: async () => {
      if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.end();
      await exit;
    },
  };
}

export interface MsRange {
  startMs: number;
  endMs: number;
}

/** The complement of `cuts` within [0, durationMs] — the ranges that survive. */
export function buildKeepRanges(durationMs: number, cuts: MsRange[]): MsRange[] {
  const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);
  const keep: MsRange[] = [];
  let cursor = 0;
  for (const cut of sorted) {
    if (cut.startMs > cursor) keep.push({ startMs: cursor, endMs: Math.min(cut.startMs, durationMs) });
    cursor = Math.max(cursor, cut.endMs);
  }
  if (cursor < durationMs) keep.push({ startMs: cursor, endMs: durationMs });
  return keep;
}

export function totalMs(ranges: MsRange[]): number {
  return ranges.reduce((sum, r) => sum + (r.endMs - r.startMs), 0);
}

/** Maps a position on the cut-removed output timeline back to the original source timeline. */
export function mapOutputMsToSourceMs(outputMs: number, keepRanges: MsRange[]): number {
  let cursor = 0;
  for (const range of keepRanges) {
    const length = range.endMs - range.startMs;
    if (outputMs < cursor + length) return range.startMs + (outputMs - cursor);
    cursor += length;
  }
  const last = keepRanges.at(-1);
  return last ? last.endMs : outputMs;
}

/**
 * Builds a single audio file that is `inputPath`'s audio track with every
 * `keepRanges` segment concatenated in order (the cut ranges removed) —
 * same timeline the video compositor produces, so video and audio stay in
 * sync without a separate remap pass.
 */
export function remapAudio(inputPath: string, keepRanges: MsRange[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (keepRanges.length === 0) return reject(new Error('remapAudio: no ranges to keep'));

    const filterParts: string[] = [];
    const labels: string[] = [];
    keepRanges.forEach((range, i) => {
      const label = `a${i}`;
      filterParts.push(`[0:a]atrim=start=${range.startMs / 1000}:end=${range.endMs / 1000}[${label}]`);
      labels.push(`[${label}]`);
    });
    filterParts.push(`${labels.join('')}concat=n=${keepRanges.length}:v=0:a=1[aout]`);

    const ffmpeg = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-filter_complex', filterParts.join(';'),
      '-map', '[aout]',
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg audio remap failed: ${stderr.slice(-800)}`));
      resolve();
    });
  });
}

/** Extracts the audio track as mono 16kHz 32-bit float PCM (what Whisper models expect). */
export function extractPcmF32Mono16k(inputPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-f', 'f32le', '-ac', '1', '-ar', '16000',
      '-',
    ]);

    const chunks: Buffer[] = [];
    let stderr = '';
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg audio extraction failed: ${stderr.slice(-800)}`));
      const buffer = Buffer.concat(chunks);
      resolve(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
    });
  });
}
