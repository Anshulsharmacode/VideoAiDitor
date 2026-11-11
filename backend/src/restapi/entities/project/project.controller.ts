import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CreateProjectDto, UpdateProjectDto } from './project.dto.js';
import { ProjectService } from './project.service.js';

@Controller('api/v1/teams/:teamId/projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectService.create(teamId, user.userId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
  ) {
    return this.projectService.list(teamId, user.userId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
  ) {
    return this.projectService.getOne(teamId, user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(teamId, user.userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
  ) {
    return this.projectService.remove(teamId, user.userId, id);
  }
}
