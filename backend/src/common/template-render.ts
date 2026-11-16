import type { TemplateLayer, VideoTemplateDocument } from './mongodb/schemas/index.js';

/**
 * Binding shapes, one per layer type that can be filled at render time.
 * Keyed by layer id in a TemplateBindings map (see render-template.mjs for
 * where these values come from: uploaded video trims, whisper words, and
 * concept-slot content).
 */
export interface VideoSlotBinding {
  source: string;
  trim: { startMs: number; endMs: number };
}

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionBinding {
  words: CaptionWord[];
}

export interface ContentSlotBinding {
  contentType: 'asset' | 'text';
  title?: string;
  asset?: string;
  description?: string;
}

export type LayerBinding = VideoSlotBinding | CaptionBinding | ContentSlotBinding;

export type TemplateBindings = Record<string, LayerBinding>;

export type RenderedLayer = TemplateLayer &
  Partial<VideoSlotBinding & CaptionBinding & ContentSlotBinding>;

export interface RenderedTemplate extends Omit<VideoTemplateDocument, 'layers'> {
  layers: RenderedLayer[];
}

/**
 * Merges a VideoTemplateDocument with per-layer bindings (the uploaded video,
 * transcript words, concept-slot content) to produce the layer tree a
 * renderer or preview can draw. Keeps the template itself generic/reusable —
 * all per-video content lives in the bindings, not the stored template.
 */
export class TemplateRenderer {
  constructor(private readonly template: VideoTemplateDocument) {}

  static from(template: VideoTemplateDocument): TemplateRenderer {
    return new TemplateRenderer(template);
  }

  render(bindings: TemplateBindings = {}): RenderedTemplate {
    const layers = this.template.layers.map((layer) => this.applyBinding(layer, bindings[layer.id]));
    return { ...this.template, layers };
  }

  layersVisibleAt(tMs: number, bindings: TemplateBindings = {}): RenderedLayer[] {
    return this.render(bindings).layers.filter((layer) => this.isVisibleAt(layer, tMs));
  }

  private applyBinding(layer: TemplateLayer, binding: LayerBinding | undefined): RenderedLayer {
    return binding ? { ...layer, ...binding } : layer;
  }

  private isVisibleAt(layer: RenderedLayer, tMs: number): boolean {
    return layer.startMs <= tMs && (layer.endMs === null || tMs <= layer.endMs);
  }
}
