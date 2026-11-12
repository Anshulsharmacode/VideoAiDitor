import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { RegisterMediaDto } from './media.dto.js';
import type { UploadedMediaFile } from './media.dto.js';
import { MediaService } from './media.service.js';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

@Controller('api/v1/teams/:teamId/projects/:projectId/media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /** Actual byte upload: writes to local disk and creates the media row. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @UploadedFile() file: UploadedMediaFile,
  ) {
    return this.mediaService.uploadAndRegister(teamId, projectId, user.userId, file);
  }

  /** Registers metadata for a file already written to storage out of band. */
  @Post()
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Body() dto: RegisterMediaDto,
  ) {
    return this.mediaService.register(teamId, projectId, user.userId, dto);
  }

  /** Kicks off transcribe -> cuts -> captions -> template -> save. */
  @Post(':id/process')
  @HttpCode(202)
  process(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.mediaService.startProcessing(teamId, projectId, user.userId, id);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.mediaService.list(teamId, projectId, user.userId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.mediaService.getOne(teamId, projectId, user.userId, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.mediaService.remove(teamId, projectId, user.userId, id);
  }
}
