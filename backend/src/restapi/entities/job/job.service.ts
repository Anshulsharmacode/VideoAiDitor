import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import type { JobDocument } from '../../../common/mongodb/schemas/job.schema.js';
import { assertTeamAccess } from '../../common/team-access.js';
import type { JobResponse } from './job.dto.js';

/**
 * No queue: the pipeline/render functions write stage/status/error directly
 * onto this row as they run (see backend-architecture.md). This service is
 * read + cancel-flag only — jobs are created inline by whatever kicks off
 * the pipeline/render module (e.g. MediaService.startProcessing).
 */
@Injectable()
export class JobService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async getOne(jobId: string, userId: string): Promise<JobResponse> {
    const job = await this.findAndAuthorize(jobId, userId);
    return this.toResponse(job);
  }

  async cancel(jobId: string, userId: string): Promise<JobResponse> {
    await this.findAndAuthorize(jobId, userId);
    const { jobs } = getCollections(this.db);
    await jobs.updateOne({ _id: jobId }, { $set: { cancelRequested: true, updatedAt: new Date() } });
    const updated = await this.findAndAuthorize(jobId, userId);
    return this.toResponse(updated);
  }

  private async findAndAuthorize(jobId: string, userId: string): Promise<JobDocument> {
    const { jobs } = getCollections(this.db);
    const job = await jobs.findOne({ _id: jobId });
    if (!job) throw new NotFoundException('Job not found');
    await assertTeamAccess(this.db, job.teamId, userId);
    return job;
  }

  private toResponse(job: JobDocument): JobResponse {
    const { _id, ...rest } = job;
    return { id: _id, ...rest };
  }
}
