import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import { newId, newTimestamps } from '../../../common/mongodb/schemas/base.schema.js';
import type { MediaDocument } from '../../../common/mongodb/schemas/media.schema.js';
import { assertTeamAccess } from '../../common/team-access.js';
import { assertProjectInTeam } from '../../common/project-access.js';
import type { MediaResponse, RegisterMediaDto } from './media.dto.js';

@Injectable()
export class MediaService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async register(
    teamId: string,
    projectId: string,
    userId: string,
    dto: RegisterMediaDto,
  ): Promise<MediaResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    const { media } = getCollections(this.db);

    const doc: MediaDocument = {
      _id: newId(),
      projectId,
      uploadedBy: userId,
      storageKey: dto.storageKey,
      originalFilename: dto.originalFilename,
      type: dto.type,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      durationMs: null,
      status: 'ready',
      ...newTimestamps(),
    };
    await media.insertOne(doc);
    return this.toResponse(doc);
  }

  async list(teamId: string, projectId: string, userId: string): Promise<MediaResponse[]> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    const { media } = getCollections(this.db);
    const found = await media.find({ projectId }).toArray();
    return found.map((doc) => this.toResponse(doc));
  }

  async getOne(teamId: string, projectId: string, userId: string, mediaId: string): Promise<MediaResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    const doc = await this.findInProject(projectId, mediaId);
    return this.toResponse(doc);
  }

  async remove(teamId: string, projectId: string, userId: string, mediaId: string): Promise<void> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    await this.findInProject(projectId, mediaId);
    const { media } = getCollections(this.db);
    await media.deleteOne({ _id: mediaId, projectId });
  }

  private async findInProject(projectId: string, mediaId: string): Promise<MediaDocument> {
    const { media } = getCollections(this.db);
    const doc = await media.findOne({ _id: mediaId, projectId });
    if (!doc) throw new NotFoundException('Media not found');
    return doc;
  }

  private toResponse(doc: MediaDocument): MediaResponse {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
  }
}
