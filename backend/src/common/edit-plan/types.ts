export interface EditPlanCut {
  id: string;
  startMs: number;
  endMs: number;
  reason?: 'filler' | 'silence' | 'manual';
}

export interface EditPlanCaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface EditPlanCaption {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words?: EditPlanCaptionWord[];
}

export interface EditPlanSticker {
  id: string;
  stickerKey: string;
  startMs: number;
  durationMs: number;
  position: { x: number; y: number };
  size: number;
  source: 'ai' | 'manual';
}

export interface EditPlanOverlay {
  id: string;
  kind: 'title' | 'chapter' | 'broll-marker';
  startMs: number;
  endMs: number;
  data: Record<string, unknown>;
}

export interface EditPlan {
  version: 1;
  templateId: string;
  sourceMediaId: string;
  durationMs: number;
  cuts: EditPlanCut[];
  captions: EditPlanCaption[];
  stickers: EditPlanSticker[];
  overlays: EditPlanOverlay[];
}

export interface EditorSettings {
  resolution: { width: number; height: number };
  aspectRatio: string;
  frameRate: number;
}
