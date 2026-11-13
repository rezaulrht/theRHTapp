import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../env';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { type AuthContext, AuthService } from './auth.service';
import { MIN_PASSWORD_LENGTH } from './owner';
import { CurrentAuth, Public } from './public.decorator';
import { sessionCookieOptions } from './session.guard';

const loginSchema = z.object({
  email: z.string().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(204)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const session = await this.auth.login(body.email, body.password);
    res.cookie(
      this.env.SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(this.env, session.expiresAt),
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth.sessionId);
    res.clearCookie(this.env.SESSION_COOKIE_NAME, { path: '/' });
  }

  @Get('me')
  me(@CurrentAuth() auth: AuthContext): { email: string } {
    return { email: auth.email };
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ): Promise<void> {
    const changed = await this.auth.changePassword(auth, body.currentPassword, body.newPassword);
    if (!changed) {
      throw new BadRequestException({
        message: 'Some fields are not valid',
        errors: [{ path: 'currentPassword', message: 'Current password is wrong' }],
      });
    }
  }
}
