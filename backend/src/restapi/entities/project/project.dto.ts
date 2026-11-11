import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { ProjectStatus } from '../../../common/mongodb/schemas/project.schema.js';

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'archived', 'deleted'];

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;
}

export interface ProjectResponse {
  id: string;
  teamId: string;
  createdBy: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}
