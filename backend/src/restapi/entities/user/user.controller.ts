import { Body, Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/jwt-auth.guard.js';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { LoginDto, RegisterDto } from './user.dto.js';
import { UserService } from './user.service.js';

@Controller('api/v1/auth')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.userService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.userService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.userService.findById(currentUser.userId);
    if (!user) throw new NotFoundException('User not found');
    return { id: user._id, name: user.name, email: user.email, status: user.status };
  }
}
