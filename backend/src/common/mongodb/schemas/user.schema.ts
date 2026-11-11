import type { BaseDocument } from './base.schema.js';

export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface UserDocument extends BaseDocument {
  name: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
}

export const USERS_COLLECTION = 'users';
