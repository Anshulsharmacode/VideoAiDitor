import { IsInt, IsObject, Min } from 'class-validator';
import type { EditPlan, EditorSettings } from '../../../common/edit-plan/types.js';

/**
 * `timeline`/`settings` are validated structurally here and then re-parsed
 * with the zod schemas in common/edit-plan at the service boundary — the
 * same schema the pipeline and render service use, so the editor can never
 * save a shape they'd reject.
 */
export class SaveEditorStateDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsObject()
  timeline!: EditPlan;

  @IsObject()
  settings!: EditorSettings;
}

export interface EditorStateResponse {
  projectId: string;
  timeline: EditPlan;
  settings: EditorSettings;
  version: number;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
