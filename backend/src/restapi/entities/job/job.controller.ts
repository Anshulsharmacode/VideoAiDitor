import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { JobService } from './job.service.js';

@Controller('api/v1/jobs')
@UseGuards(JwtAuthGuard)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobService.getOne(id, user.userId);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobService.cancel(id, user.userId);
  }
}
