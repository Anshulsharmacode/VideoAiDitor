import { randomUUID } from 'node:crypto';

export interface BaseDocument {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

export function newId(): string {
  return randomUUID();
}

export function newTimestamps(): Pick<BaseDocument, 'createdAt' | 'updatedAt'> {
  const now = new Date();
  return { createdAt: now, updatedAt: now };
}
