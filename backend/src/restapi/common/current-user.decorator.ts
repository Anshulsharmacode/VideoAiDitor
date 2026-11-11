import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
  return request.user;
});
