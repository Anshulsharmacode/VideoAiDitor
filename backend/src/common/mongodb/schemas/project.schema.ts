import type { BaseDocument } from './base.schema.js';
import type { EditPlan } from '../../edit-plan/types.js';

export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface ProjectDocument extends BaseDocument {
  teamId: string;
  createdBy: string;
  name: string;
  status: ProjectStatus;
  editPlan: EditPlan | null;
}

export const PROJECTS_COLLECTION = 'projects';
