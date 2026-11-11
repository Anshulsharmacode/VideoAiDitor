import type { BaseDocument } from './base.schema.js';

export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface ProjectDocument extends BaseDocument {
  teamId: string;
  createdBy: string;
  name: string;
  status: ProjectStatus;
}

export const PROJECTS_COLLECTION = 'projects';
