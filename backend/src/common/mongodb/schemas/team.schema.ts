import type { BaseDocument } from './base.schema.js';

export interface TeamDocument extends BaseDocument {
  name: string;
  ownerId: string;
}

export const TEAMS_COLLECTION = 'teams';
