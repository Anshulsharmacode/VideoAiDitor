import { mkdir, readFile as fsReadFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Local-disk storage adapter (see backend-architecture.md's "Local storage
 * layout"). `key` is always a path relative to STORAGE_ROOT, the same shape
 * an object-storage key would have — swapping to R2/S3 later means
 * rewriting only this file.
 */
function storageRoot(): string {
  return resolve(process.cwd(), process.env.STORAGE_ROOT ?? './storage');
}

export function absolutePathFor(key: string): string {
  return join(storageRoot(), key);
}

export async function saveFile(key: string, data: Buffer): Promise<void> {
  const path = absolutePathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export async function readFile(key: string): Promise<Buffer> {
  return fsReadFile(absolutePathFor(key));
}
