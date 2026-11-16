import { z } from 'zod';
import type { BaseDocument } from './base.schema.js';

export interface TemplateCanvas {
  width: number;
  height: number;
  fps: number;
}

export interface TemplateBackground {
  type: 'color' | 'image' | 'video';
  value: string;
}

export interface TemplateCaptionStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  highlightColor: string;
  animation: 'word-pop' | 'karaoke' | 'none';
  maxWordsPerLine: number;
}

interface TemplateLayerBase {
  id: string;
  startMs: number;
  endMs: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface VideoSlotLayer extends TemplateLayerBase {
  type: 'video-slot';
  role: 'subject';
  fit: 'cover' | 'contain' | 'fill';
}

export interface CaptionSlotLayer extends TemplateLayerBase {
  type: 'caption-slot';
  role: 'transcript';
  style: TemplateCaptionStyle;
}

export interface ImageLayer extends TemplateLayerBase {
  type: 'image';
  source: string;
}

export interface TextLayer extends TemplateLayerBase {
  type: 'text';
  text: string;
  style: Pick<TemplateCaptionStyle, 'fontFamily' | 'fontSize' | 'color'>;
}

export interface ContentSlotLayer extends TemplateLayerBase {
  type: 'content-slot';
  role: 'concept-explainer';
}

export type TemplateLayer =
  | VideoSlotLayer
  | CaptionSlotLayer
  | ImageLayer
  | TextLayer
  | ContentSlotLayer;

export interface TemplateAudio {
  musicUrl: string | null;
  volume: number;
  duckUnderVoice: boolean;
}

export interface VideoTemplateDocument extends BaseDocument {
  name: string;
  durationMs: number;
  canvas: TemplateCanvas;
  background: TemplateBackground;
  layers: TemplateLayer[];
  audio: TemplateAudio;
}

export const VIDEO_TEMPLATES_COLLECTION = 'videoTemplates';

const templateCanvasSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
});

const templateBackgroundSchema = z.object({
  type: z.enum(['color', 'image', 'video']),
  value: z.string().min(1),
});

const templateCaptionStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().int().positive(),
  color: z.string().min(1),
  highlightColor: z.string().min(1),
  animation: z.enum(['word-pop', 'karaoke', 'none']),
  maxWordsPerLine: z.number().int().positive(),
});

const layerBaseSchema = {
  id: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  zIndex: z.number().int(),
};

const videoSlotLayerSchema = z.object({
  ...layerBaseSchema,
  type: z.literal('video-slot'),
  role: z.literal('subject'),
  fit: z.enum(['cover', 'contain', 'fill']),
});

const captionSlotLayerSchema = z.object({
  ...layerBaseSchema,
  type: z.literal('caption-slot'),
  role: z.literal('transcript'),
  style: templateCaptionStyleSchema,
});

const imageLayerSchema = z.object({
  ...layerBaseSchema,
  type: z.literal('image'),
  source: z.string().min(1),
});

const textLayerSchema = z.object({
  ...layerBaseSchema,
  type: z.literal('text'),
  text: z.string().min(1),
  style: templateCaptionStyleSchema.pick({ fontFamily: true, fontSize: true, color: true }),
});

const contentSlotLayerSchema = z.object({
  ...layerBaseSchema,
  type: z.literal('content-slot'),
  role: z.literal('concept-explainer'),
});

const templateLayerSchema = z.discriminatedUnion('type', [
  videoSlotLayerSchema,
  captionSlotLayerSchema,
  imageLayerSchema,
  textLayerSchema,
  contentSlotLayerSchema,
]);

const templateAudioSchema = z.object({
  musicUrl: z.string().min(1).nullable(),
  volume: z.number().min(0).max(1),
  duckUnderVoice: z.boolean(),
});

export const videoTemplateSchema = z
  .object({
    name: z.string().min(1),
    durationMs: z.number().int().positive(),
    canvas: templateCanvasSchema,
    background: templateBackgroundSchema,
    layers: z.array(templateLayerSchema).min(1),
    audio: templateAudioSchema,
  })
  .refine((template) => template.layers.some((layer) => layer.type === 'video-slot'), {
    message: 'Template must have a video-slot layer for the user video',
  });

export function parseVideoTemplate(data: unknown) {
  return videoTemplateSchema.parse(data);
}

export function safeParseVideoTemplate(data: unknown) {
  return videoTemplateSchema.safeParse(data);
}
