import type { BaseDocument } from './base.schema.js';

export type StyleCategory = 'shorts' | 'talking-head' | 'podcast-clip' | 'general';
export type CaptionPosition = 'top' | 'center' | 'bottom';
export type CaptionAnimation = 'pop' | 'karaoke-word' | 'slide-up' | 'fade';
export type StickerEntranceAnimation = 'pop' | 'fade' | 'bounce';
export type CutAggressiveness = 'low' | 'medium' | 'high';

export interface StyleDocument extends BaseDocument {
  key: string;
  name: string;
  category: StyleCategory;
  caption: {
    fontFamily: string;
    fontSize: number;
    color: string;
    highlightColor: string;
    position: CaptionPosition;
    backgroundPill: boolean;
    animation: CaptionAnimation;
    maxWordsPerLine: number;
  };
  theme: {
    colorGrade: string | null;
    borderAsset: string | null;
    watermark: { assetKey: string; position: string } | null;
    introAssetKey: string | null;
    outroAssetKey: string | null;
  };
  stickerDefaults: {
    defaultSize: number;
    entranceAnimation: StickerEntranceAnimation;
    defaultDurationMs: number;
  };
  pacing: {
    cutAggressiveness: CutAggressiveness;
    allowAutoZoom: boolean;
  };
}

export const STYLES_COLLECTION = 'styles';
