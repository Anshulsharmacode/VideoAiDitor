import { NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { getCollections } from '../../common/mongodb/collections.js';
import type { ProjectDocument } from '../../common/mongodb/schemas/project.schema.js';

/**
 * Shared "does this project belong to this team" check, reused by every
 * route nested under /teams/:teamId/projects/:projectId (media, editor
 * state, exports, ...).
 */
export async function assertProjectInTeam(db: Db, teamId: string, projectId: string): Promise<ProjectDocument> {
  const { projects } = getCollections(db);
  const project = await projects.findOne({ _id: projectId, teamId });
  if (!project) throw new NotFoundException('Project not found');
  return project;
}
