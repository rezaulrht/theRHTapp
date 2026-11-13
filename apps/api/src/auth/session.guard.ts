import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CookieOptions, Response } from 'express';
import { ENV, type Env } from '../env';
import { AuthService } from './auth.service';
import { type AuthedRequest, IS_PUBLIC } from './public.decorator';

export function sessionCookieOptions(env: Env, expires: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
  };
}

/** Applied to every route. Anything not marked @Public() needs a valid session cookie. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[this.env.SESSION_COOKIE_NAME];
    const session = typeof token === 'string' && token ? await this.auth.validate(token) : null;
    if (!session) throw new UnauthorizedException('Log in to continue');

    const { renewedUntil, ...auth } = session;
    req.auth = auth;
    if (renewedUntil) {
      http
        .getResponse<Response>()
        .cookie(this.env.SESSION_COOKIE_NAME, token as string, sessionCookieOptions(this.env, renewedUntil));
    }
    return true;
  }
}
