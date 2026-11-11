import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { RegisterMediaDto } from './media.dto.js';
import { MediaService } from './media.service.js';

@Controller('api/v1/teams/:teamId/projects/:projectId/media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Body() dto: RegisterMediaDto,
  ) {
    return this.mediaService.register(teamId, projectId, user.userId, dto);
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
