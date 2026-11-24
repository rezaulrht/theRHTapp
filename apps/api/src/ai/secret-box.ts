import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** A secret as it is kept in the database: unreadable without the server's own secret. */
export interface Sealed {
  iv: string;
  tag: string;
  data: string;
}

const keyFrom = (secret: string): Buffer => createHash('sha256').update(`pa-secrets:${secret}`).digest();

/** Encrypts `plain` with AES-256-GCM, a new random IV each time. */
export function seal(plain: string, secret: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/** The original text, or null when `secret` is not the one it was sealed with or the value was changed. */
export function unseal(sealed: Sealed, secret: string): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Type guard for what is read back from the database. */
export function isSealed(value: unknown): value is Sealed {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.iv === 'string' && typeof record.tag === 'string' && typeof record.data === 'string';
}

/** What encrypts saved secrets: SECRETS_KEY if set, otherwise the database address. */
export function secretOf(env: { SECRETS_KEY?: string; DATABASE_URL: string }): string {
  return env.SECRETS_KEY ?? env.DATABASE_URL;
}
