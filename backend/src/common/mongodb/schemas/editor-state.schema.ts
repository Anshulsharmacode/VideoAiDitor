import type { EditPlan, EditorSettings } from '../../edit-plan/types.js';

export interface EditorStateDocument {
  _id: string;
  projectId: string;
  timeline: EditPlan;
  settings: EditorSettings;
  version: number;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const EDITOR_STATES_COLLECTION = 'editor_states';
