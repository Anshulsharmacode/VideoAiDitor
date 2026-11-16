import { Injectable, type OnModuleInit } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { extractPcmF32Mono16k } from './ffmpeg.util.js';

export interface TranscribedWord {
  word: string;
  start: number;
  end: number;
}

const MODEL = process.env.WHISPER_MODEL ?? 'Xenova/whisper-base';

interface AsrChunk {
  text: string;
  timestamp: [number, number | null];
}

/**
 * Speech-to-text entirely in Node (no Python, no sidecar process), backed
 * by transformers.js running the ONNX whisper model on CPU. Loads the
 * model once (see onModuleInit) and reuses it for every call — same
 * reasoning the old Flask server had for keeping faster-whisper warm,
 * just in-process now.
 */
@Injectable()
export class WhisperService implements OnModuleInit {
  private pipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

  async onModuleInit(): Promise<void> {
    void this.getPipeline(); // warm the model in the background at startup
  }

  private getPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
    this.pipelinePromise ??= pipeline('automatic-speech-recognition', MODEL);
    return this.pipelinePromise;
  }

  async transcribe(media: Buffer, filename: string): Promise<TranscribedWord[]> {
    const transcriber = await this.getPipeline();
    const workDir = await mkdtemp(join(tmpdir(), 'whisper-'));
    const inputExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.bin';
    const inputPath = join(workDir, `input${inputExt}`);

    try {
      await writeFile(inputPath, media);
      const audio = await extractPcmF32Mono16k(inputPath);

      const result = await transcriber(audio, {
        return_timestamps: 'word',
        chunk_length_s: 30,
      });

      const output = Array.isArray(result) ? result[0] : result;
      const chunks = (output?.chunks ?? []) as AsrChunk[];
      return chunks.map((chunk) => ({
        word: chunk.text.trim(),
        start: chunk.timestamp[0] ?? 0,
        end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0,
      }));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
