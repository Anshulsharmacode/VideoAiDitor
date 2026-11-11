import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import type { StyleDocument } from '../../../common/mongodb/schemas/style.schema.js';
import type { StyleResponse } from './style.dto.js';

/**
 * Hand-authored template catalog (caption style, theme, pacing). Seeded by
 * the team; this service only ever reads it — there's no create/update route
 * in this phase (see PRD's "explicitly out of scope").
 */
@Injectable()
export class StyleService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async list(): Promise<StyleResponse[]> {
    const { styles } = getCollections(this.db);
    const found = await styles.find().toArray();
    return found.map((style) => this.toResponse(style));
  }

  async getOne(styleId: string): Promise<StyleResponse> {
    const { styles } = getCollections(this.db);
    const style = await styles.findOne({ _id: styleId });
    if (!style) throw new NotFoundException('Style not found');
    return this.toResponse(style);
  }

  private toResponse(style: StyleDocument): StyleResponse {
    const { _id, ...rest } = style;
    return { id: _id, ...rest };
  }
}
