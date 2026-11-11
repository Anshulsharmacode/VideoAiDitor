import type { BaseDocument } from './base.schema.js';

export type JobKind = 'pipeline' | 'render';
export type JobStatus = 'running' | 'completed' | 'failed';

export type PipelineStage =
  | 'prepare'
  | 'transcribe'
  | 'cuts'
  | 'captions'
  | 'stickers'
  | 'template'
  | 'save';

export type RenderStage = 'load_snapshot' | 'render' | 'upload' | 'complete';

export interface JobDocument extends BaseDocument {
  teamId: string;
  projectId: string;
  kind: JobKind;
  status: JobStatus;
  stage: PipelineStage | RenderStage;
  error: string | null;
  cancelRequested: boolean;
}

export const JOBS_COLLECTION = 'jobs';
