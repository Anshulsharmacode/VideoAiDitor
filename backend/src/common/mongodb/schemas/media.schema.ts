import type { BaseDocument } from './base.schema.js';

export type MediaType = 'video' | 'audio' | 'image';
export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface MediaDocument extends BaseDocument {
  projectId: string;
  uploadedBy: string;
  storageKey: string;
  originalFilename: string;
  type: MediaType;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  status: MediaStatus;
}

export const MEDIA_COLLECTION = 'media';
