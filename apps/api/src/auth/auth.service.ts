import { createHash, randomBytes } from 'node:crypto';
import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { isLocked, registerFailure } from './lockout';
import { normalizeEmail } from './owner';

export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const WRONG_LOGIN = 'Email or password is wrong';
/** How long a checked session is trusted without asking the database again. Logging out clears it at once; this only bounds a failed clean-up. */
const SESSION_COPY_SECONDS = 120;

interface SessionCopy extends AuthContext {
  expiresAt: string;
  lastUsedAt: string;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so both failures take the same time. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async login(email: string, password: string, now = new Date()): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });

    if (!user) {
      this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'));
      await argon2.verify(await this.dummyHash, password);
      throw new UnauthorizedException(WRONG_LOGIN);
    }

    if (isLocked(user, now)) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil!.getTime() - now.getTime()) / 1000);
      throw new HttpException(
        { message: 'Too many attempts. Try again later.', retryAfterSeconds },
        423,
      );
    }

    if (!(await argon2.verify(user.passwordHash, password))) {
      await this.prisma.user.update({ where: { id: user.id }, data: registerFailure(user, now) });
      throw new UnauthorizedException(WRONG_LOGIN);
    }

    if (user.failedAttempts !== 0 || user.lockedUntil !== null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_MS);
    await this.prisma.session.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt, lastUsedAt: now },
    });
    return { token, expiresAt };
  }

  /**
   * Resolves a cookie value to its session. `renewedUntil` is set when the
   * session had not been used for a day and was extended; the caller then
   * re-sends the cookie.
   */
  async validate(
    token: string,
    now = new Date(),
  ): Promise<(AuthContext & { renewedUntil?: Date }) | null> {
    // Every request is checked, and the database is far away: a recent check is reused.
    const copyKey = `session:${hashToken(token)}`;
    const copy = await this.cache.getJson<SessionCopy>(copyKey);
    if (
      copy &&
      Date.parse(copy.expiresAt) > now.getTime() &&
      now.getTime() - Date.parse(copy.lastUsedAt) <= RENEW_AFTER_MS
    ) {
      return { userId: copy.userId, sessionId: copy.sessionId, email: copy.email };
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) {
      await this.cache.del(copyKey);
      return null;
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      await this.cache.del(copyKey);
      return null;
    }

    const context: AuthContext = {
      userId: session.userId,
      sessionId: session.id,
      email: session.user.email,
    };
    const keep = async (expiresAt: Date, lastUsedAt: Date) => {
      const seconds = Math.min(SESSION_COPY_SECONDS, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      if (seconds > 0) {
        const stored: SessionCopy = { ...context, expiresAt: expiresAt.toISOString(), lastUsedAt: lastUsedAt.toISOString() };
        await this.cache.setJson(copyKey, stored, seconds);
      }
    };
    if (now.getTime() - session.lastUsedAt.getTime() <= RENEW_AFTER_MS) {
      await keep(session.expiresAt, session.lastUsedAt);
      return context;
    }

    const renewedUntil = new Date(now.getTime() + SESSION_MS);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: renewedUntil },
    });
    await keep(renewedUntil, now);
    return { ...context, renewedUntil };
  }

  async logout(sessionId: string): Promise<void> {
    // The copy is keyed by the token's hash, so find it before the session goes.
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { tokenHash: true } });
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
    if (session) await this.cache.del(`session:${session.tokenHash}`);
  }

  /** Returns false when the current password is wrong. Ends every other session. */
  async changePassword(auth: AuthContext, current: string, next: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await argon2.verify(user.passwordHash, current))) return false;
    const others = await this.prisma.session.findMany({
      where: { userId: user.id, id: { not: auth.sessionId } },
      select: { tokenHash: true },
    });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(next) },
      }),
      this.prisma.session.deleteMany({
        where: { userId: user.id, id: { not: auth.sessionId } },
      }),
    ]);
    // Other devices are logged out now, not when their copies run out.
    await this.cache.del(...others.map((session) => `session:${session.tokenHash}`));
    return true;
  }
}
