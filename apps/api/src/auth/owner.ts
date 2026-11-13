import * as argon2 from 'argon2';
import type { PrismaClient } from '@pa/db';

export const MIN_PASSWORD_LENGTH = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertPasswordLongEnough(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/**
 * Creates the app's single account. With `resetPassword` it instead sets a new
 * password on the existing account and ends every session.
 */
export async function createOwner(
  prisma: PrismaClient,
  email: string,
  password: string,
  options: { resetPassword?: boolean } = {},
): Promise<void> {
  assertPasswordLongEnough(password);
  const passwordHash = await argon2.hash(password);
  const existing = await prisma.user.findFirst();

  if (options.resetPassword) {
    if (!existing) throw new Error('There is no owner account to reset');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, failedAttempts: 0, lockedUntil: null },
      }),
      prisma.session.deleteMany({ where: { userId: existing.id } }),
    ]);
    return;
  }

  if (existing) {
    throw new Error('An owner account already exists. Run again with --reset-password to change its password.');
  }
  await prisma.user.create({ data: { email: normalizeEmail(email), passwordHash } });
}
