import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { extname } from 'node:path';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import { newId, newTimestamps } from '../../../common/mongodb/schemas/base.schema.js';
import type { JobDocument } from '../../../common/mongodb/schemas/job.schema.js';
import type { MediaDocument, MediaType } from '../../../common/mongodb/schemas/media.schema.js';
import { saveFile } from '../../../common/storage/storage.js';
import { runPipeline } from '../../../pipeline/run-pipeline.js';
import { assertTeamAccess } from '../../common/team-access.js';
import { assertProjectInTeam } from '../../common/project-access.js';
import type { MediaResponse, RegisterMediaDto, UploadedMediaFile } from './media.dto.js';

@Injectable()
export class MediaService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  /**
   * Streams the uploaded file straight to local disk (see
   * backend-architecture.md's Local storage layout) and creates the media
   * row in one step. Multer buffers the whole file in memory by default,
   * which is fine for now but should move to a streamed disk write before
   * large files are expected.
   */
  async uploadAndRegister(
    teamId: string,
    projectId: string,
    userId: string,
    file: UploadedMediaFile,
  ): Promise<MediaResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);

    const type = mediaTypeFromMime(file.mimetype);
    const mediaId = newId();
    const extension = extname(file.originalname) || '.bin';
    const storageKey = `uploads/${teamId}/${mediaId}/original${extension}`;
    await saveFile(storageKey, file.buffer);

    const { media } = getCollections(this.db);
    const doc: MediaDocument = {
      _id: mediaId,
      projectId,
      uploadedBy: userId,
      storageKey,
      originalFilename: file.originalname,
      type,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      durationMs: null,
      status: 'ready',
      ...newTimestamps(),
    };
    await media.insertOne(doc);
    return this.toResponse(doc);
  }

  /**
   * Creates a `jobs` row and kicks off the pipeline (transcribe -> cuts ->
   * captions -> template -> save) as a fire-and-forget async
   * call, per backend-architecture.md — no queue. The caller polls
   * GET /api/v1/jobs/:id for progress and reads the result from
   * GET .../editor-state once it completes.
   */
  async startProcessing(
    teamId: string,
    projectId: string,
    userId: string,
    mediaId: string,
  ): Promise<{ jobId: string }> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    await this.findInProject(projectId, mediaId);

    const { jobs } = getCollections(this.db);
    const job: JobDocument = {
      _id: newId(),
      teamId,
      projectId,
      kind: 'pipeline',
      status: 'running',
      stage: 'prepare',
      error: null,
      cancelRequested: false,
      ...newTimestamps(),
    };
    await jobs.insertOne(job);

    void runPipeline(this.db, { jobId: job._id, teamId, projectId, mediaId });

    return { jobId: job._id };
  }

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

function mediaTypeFromMime(mimeType: string): MediaType {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  throw new BadRequestException(`Unsupported mime type: ${mimeType}`);
}
