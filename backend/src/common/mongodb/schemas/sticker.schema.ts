import type { BaseDocument } from './base.schema.js';

export type StickerKind = 'emoji' | 'sticker';
export type StickerAnimation = 'pop' | 'bounce' | 'fade';

export interface StickerDocument extends BaseDocument {
  key: string;
  assetKey: string;
  kind: StickerKind;
  tags: string[];
  defaultAnimation: StickerAnimation;
}

export const STICKERS_COLLECTION = 'stickers';
