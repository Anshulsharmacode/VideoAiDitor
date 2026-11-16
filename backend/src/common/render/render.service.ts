import { rm } from 'node:fs/promises';
import {
  buildKeepRanges,
  createMp4Encoder,
  decodeFramesRgb24,
  mapOutputMsToSourceMs,
  probeVideo,
  remapAudio,
  totalMs,
  type MsRange,
} from '../media-processing/ffmpeg.util.js';
import { TemplateRenderer, type TemplateBindings } from '../template-render.js';
import type { VideoTemplateDocument } from '../mongodb/schemas/index.js';
import { drawFrame, type VideoFrameProvider } from './compositor.js';

export interface RenderJobInput {
  template: VideoTemplateDocument;
  /** video-slot bindings' `source` must be a local file path (already downloaded/decoded media). */
  bindings: TemplateBindings;
  /** EditPlan.cuts ranges to remove from the output timeline — [] renders the full template. */
  cuts: MsRange[];
  /** Local file to pull the voice track from; null renders silent. */
  voiceAudioPath: string | null;
  outputPath: string;
}

function backgroundColorOf(template: VideoTemplateDocument): string {
  return template.background.type === 'color' ? template.background.value : '#0b1020';
}

/**
 * Turns a template + bindings (+ optional EditPlan cuts) into an actual
 * .mp4: decodes every bound source video once, then walks the cut-removed
 * output timeline frame by frame, drawing each frame with the compositor
 * and piping it into an ffmpeg encoder. Mirrors
 * BackgroundRemovalService's decode/compose/encode shape.
 */
export async function renderProject(input: RenderJobInput): Promise<void> {
  const { template, bindings, cuts, voiceAudioPath, outputPath } = input;
  const { width, height, fps } = template.canvas;
  const renderer = TemplateRenderer.from(template);

  // Decode each distinct source once, into memory, at a size capped to the
  // output canvas (never the source's native resolution) — holding a full
  // 4K source's frames in RAM for a 1080p render is how this blew up memory
  // before this cap.
  const videoSources = new Map<string, { fps: number; width: number; height: number; frames: Buffer[] }>();
  for (const binding of Object.values(bindings)) {
    if (!('source' in binding) || !binding.source || videoSources.has(binding.source)) continue;
    const probe = await probeVideo(binding.source);
    const scale = Math.min(1, width / probe.width, height / probe.height);
    const decodeWidth = Math.max(2, Math.round((probe.width * scale) / 2) * 2);
    const decodeHeight = Math.max(2, Math.round((probe.height * scale) / 2) * 2);
    const frames: Buffer[] = [];
    await decodeFramesRgb24(binding.source, { width: decodeWidth, height: decodeHeight }, (frame) => {
      frames.push(frame);
    });
    videoSources.set(binding.source, { fps: probe.fps || 30, width: decodeWidth, height: decodeHeight, frames });
  }

  const getVideoFrame: VideoFrameProvider = (source, sourceMs) => {
    const entry = videoSources.get(source);
    if (!entry || entry.frames.length === 0) return null;
    const index = Math.min(entry.frames.length - 1, Math.max(0, Math.round((sourceMs / 1000) * entry.fps)));
    return { buffer: entry.frames[index], width: entry.width, height: entry.height };
  };

  const keepRanges = buildKeepRanges(template.durationMs, cuts);
  const outputDurationMs = totalMs(keepRanges);
  const totalFrames = Math.max(1, Math.ceil((outputDurationMs / 1000) * fps));

  let audioPath: string | null = null;
  if (voiceAudioPath) {
    audioPath = `${outputPath}.audio.m4a`;
    await remapAudio(voiceAudioPath, keepRanges, audioPath);
  }

  const encoder = createMp4Encoder(audioPath, outputPath, { width, height, fps });
  try {
    for (let i = 0; i < totalFrames; i++) {
      const outputMs = (i / fps) * 1000;
      const sourceMs = mapOutputMsToSourceMs(outputMs, keepRanges);
      const layers = renderer.layersVisibleAt(sourceMs, bindings);
      const frame = drawFrame({ width, height }, backgroundColorOf(template), layers, sourceMs, getVideoFrame);
      await encoder.write(frame);
    }
  } finally {
    await encoder.end();
    if (audioPath) await rm(audioPath, { force: true });
  }
}
