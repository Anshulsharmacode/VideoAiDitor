import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CreateTeamDto } from './team.dto.js';
import { TeamService } from './team.service.js';

@Controller('api/v1/teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTeamDto) {
    return this.teamService.createTeam(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.teamService.listForOwner(user.userId);
  }

  @Get(':teamId')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('teamId') teamId: string) {
    return this.teamService.getById(teamId, user.userId);
  }
}
