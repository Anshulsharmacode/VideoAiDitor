import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/jwt-auth.guard.js';
import { RestapiController } from './restapi.controller.js';
import { UserController } from './entities/user/user.controller.js';
import { UserService } from './entities/user/user.service.js';
import { TeamController } from './entities/team/team.controller.js';
import { TeamService } from './entities/team/team.service.js';
import { ProjectController } from './entities/project/project.controller.js';
import { ProjectService } from './entities/project/project.service.js';
import { MediaController } from './entities/media/media.controller.js';
import { MediaService } from './entities/media/media.service.js';
import { EditorStateController } from './entities/editor-state/editor-state.controller.js';
import { EditorStateService } from './entities/editor-state/editor-state.service.js';
import { StyleController } from './entities/style/style.controller.js';
import { StyleService } from './entities/style/style.service.js';
import { StickerController } from './entities/sticker/sticker.controller.js';
import { StickerService } from './entities/sticker/sticker.service.js';
import { JobController } from './entities/job/job.controller.js';
import { JobService } from './entities/job/job.service.js';

/**
 * Single module for the whole REST API — every entity (user, team, project,
 * media, editor-state, style, sticker, job) is a controller+service pair
 * registered here rather than its own NestJS module. JWT config lives here
 * too, once, instead of being redeclared per entity.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as `${number}d`,
      },
    }),
  ],
  controllers: [
    RestapiController,
    UserController,
    TeamController,
    ProjectController,
    MediaController,
    EditorStateController,
    StyleController,
    StickerController,
    JobController,
  ],
  providers: [
    JwtAuthGuard,
    UserService,
    TeamService,
    ProjectService,
    MediaService,
    EditorStateService,
    StyleService,
    StickerService,
    JobService,
  ],
})
export class RestapiModule {}
