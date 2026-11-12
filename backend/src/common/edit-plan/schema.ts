import { z } from 'zod';

export const editPlanCutSchema = z
  .object({
    id: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    reason: z.enum(['filler', 'silence', 'manual']).optional(),
  })
  .refine((cut) => cut.endMs > cut.startMs, { message: 'endMs must be after startMs' });

export const editPlanCaptionWordSchema = z
  .object({
    text: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .refine((word) => word.endMs > word.startMs, { message: 'endMs must be after startMs' });

export const editPlanCaptionSchema = z
  .object({
    id: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    text: z.string().min(1),
    words: z.array(editPlanCaptionWordSchema).optional(),
  })
  .refine((caption) => caption.endMs > caption.startMs, {
    message: 'endMs must be after startMs',
  });

export const editPlanOverlaySchema = z
  .object({
    id: z.string(),
    kind: z.enum(['title', 'chapter', 'broll-marker']),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    data: z.record(z.string(), z.unknown()),
  })
  .refine((overlay) => overlay.endMs > overlay.startMs, {
    message: 'endMs must be after startMs',
  });

export const editPlanSchema = z.object({
  version: z.literal(1),
  templateId: z.string().min(1),
  sourceMediaId: z.string().min(1),
  durationMs: z.number().int().positive(),
  cuts: z.array(editPlanCutSchema),
  captions: z.array(editPlanCaptionSchema),
  overlays: z.array(editPlanOverlaySchema),
});

export const editorSettingsSchema = z.object({
  resolution: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  aspectRatio: z.string().min(1),
  frameRate: z.number().int().positive(),
});

export function parseEditPlan(data: unknown) {
  return editPlanSchema.parse(data);
}

export function safeParseEditPlan(data: unknown) {
  return editPlanSchema.safeParse(data);
}
