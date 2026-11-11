import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import { newId, newTimestamps } from '../../../common/mongodb/schemas/base.schema.js';
import type { ProjectDocument } from '../../../common/mongodb/schemas/project.schema.js';
import { assertTeamAccess } from '../../common/team-access.js';
import { assertProjectInTeam } from '../../common/project-access.js';
import type { CreateProjectDto, ProjectResponse, UpdateProjectDto } from './project.dto.js';

@Injectable()
export class ProjectService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async create(teamId: string, userId: string, dto: CreateProjectDto): Promise<ProjectResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    const { projects } = getCollections(this.db);

    const project: ProjectDocument = {
      _id: newId(),
      teamId,
      createdBy: userId,
      name: dto.name.trim(),
      status: 'active',
      ...newTimestamps(),
    };
    await projects.insertOne(project);
    return this.toResponse(project);
  }

  async list(teamId: string, userId: string): Promise<ProjectResponse[]> {
    await assertTeamAccess(this.db, teamId, userId);
    const { projects } = getCollections(this.db);
    const found = await projects.find({ teamId, status: { $ne: 'deleted' } }).toArray();
    return found.map((project) => this.toResponse(project));
  }

  async getOne(teamId: string, userId: string, projectId: string): Promise<ProjectResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    const project = await assertProjectInTeam(this.db, teamId, projectId);
    return this.toResponse(project);
  }

  async update(
    teamId: string,
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    const { projects } = getCollections(this.db);

    const update: Partial<ProjectDocument> = { updatedAt: new Date() };
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.status !== undefined) update.status = dto.status;

    await projects.updateOne({ _id: projectId, teamId }, { $set: update });
    const updated = await assertProjectInTeam(this.db, teamId, projectId);
    return this.toResponse(updated);
  }

  async remove(teamId: string, userId: string, projectId: string): Promise<void> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    const { projects } = getCollections(this.db);
    await projects.updateOne(
      { _id: projectId, teamId },
      { $set: { status: 'deleted', updatedAt: new Date() } },
    );
  }

  private toResponse(project: ProjectDocument): ProjectResponse {
    return {
      id: project._id,
      teamId: project.teamId,
      createdBy: project.createdBy,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
