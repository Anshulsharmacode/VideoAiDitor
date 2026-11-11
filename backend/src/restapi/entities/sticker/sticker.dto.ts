import type { StickerDocument } from '../../../common/mongodb/schemas/sticker.schema.js';

export type StickerResponse = Omit<StickerDocument, '_id'> & { id: string };
