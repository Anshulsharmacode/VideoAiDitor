import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import type { MediaDocument, MediaType } from '../../../common/mongodb/schemas/media.schema.js';

const MEDIA_TYPES: MediaType[] = ['video', 'audio', 'image'];

/**
 * Registers metadata for a file already written to storage. The actual
 * byte-streaming upload endpoint belongs to the local-disk `storage` module
 * described in backend-architecture.md, which doesn't exist yet — this DTO
 * is the seam it will plug into (API writes the file, then calls this with
 * the resulting `storageKey`).
 */
export class RegisterMediaDto {
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @IsString()
  @MinLength(1)
  originalFilename!: string;

  @IsIn(MEDIA_TYPES)
  type!: MediaType;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @Min(0)
  sizeBytes!: number;
}

export type MediaResponse = Omit<MediaDocument, '_id'> & { id: string };

/**
 * The subset of a multer in-memory file object we actually use. Defined
 * locally instead of relying on `Express.Multer.File` since neither
 * `multer` nor `@types/multer` ship that augmentation in this project.
 */
export interface UploadedMediaFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
