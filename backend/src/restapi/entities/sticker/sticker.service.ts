import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import type { StickerDocument } from '../../../common/mongodb/schemas/sticker.schema.js';
import type { StickerResponse } from './sticker.dto.js';

/**
 * Static, bundled sticker/emoji library. The AI planner only selects from
 * this catalog by matching `tags` against the transcript — it never
 * generates new sticker images (out of scope for this phase).
 */
@Injectable()
export class StickerService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async list(tag?: string): Promise<StickerResponse[]> {
    const { stickers } = getCollections(this.db);
    const filter = tag ? { tags: tag } : {};
    const found = await stickers.find(filter).toArray();
    return found.map((sticker) => this.toResponse(sticker));
  }

  async getOne(stickerId: string): Promise<StickerResponse> {
    const { stickers } = getCollections(this.db);
    const sticker = await stickers.findOne({ _id: stickerId });
    if (!sticker) throw new NotFoundException('Sticker not found');
    return this.toResponse(sticker);
  }

  private toResponse(sticker: StickerDocument): StickerResponse {
    const { _id, ...rest } = sticker;
    return { id: _id, ...rest };
  }
}
