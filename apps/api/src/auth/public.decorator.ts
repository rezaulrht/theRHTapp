import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth.service';

export const IS_PUBLIC = 'isPublic';

/** Marks a route that works without logging in. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthedRequest = Request & { auth?: AuthContext };

/** The logged-in session for this request. */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().auth;
});
