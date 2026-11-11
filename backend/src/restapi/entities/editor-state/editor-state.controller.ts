import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { SaveEditorStateDto } from './editor-state.dto.js';
import { EditorStateService } from './editor-state.service.js';

@Controller('api/v1/teams/:teamId/projects/:projectId/editor-state')
@UseGuards(JwtAuthGuard)
export class EditorStateController {
  constructor(private readonly editorStateService: EditorStateService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.editorStateService.get(teamId, projectId, user.userId);
  }

  @Put()
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('projectId') projectId: string,
    @Body() dto: SaveEditorStateDto,
  ) {
    return this.editorStateService.save(teamId, projectId, user.userId, dto);
  }
}
