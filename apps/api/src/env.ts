import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

/** Needed to send reminders. Required in production, optional elsewhere. */
const DELIVERY_KEYS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'WEB_ORIGIN',
] as const;

const optionalText = z.string().min(1).optional();

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SESSION_COOKIE_NAME: z.string().min(1).default('pa_session'),
    /** Web push keys: `npx web-push generate-vapid-keys`. */
    VAPID_PUBLIC_KEY: optionalText,
    VAPID_PRIVATE_KEY: optionalText,
    /** A `mailto:` address push services can contact about this server. */
    VAPID_SUBJECT: optionalText,
    RESEND_API_KEY: optionalText,
    /** The sender shown on reminder emails, e.g. `Personal <reminders@example.com>`. */
    EMAIL_FROM: optionalText,
    /** Public address of the web app, used for links in emails. */
    WEB_ORIGIN: z
      .string()
      .min(1)
      .transform((origin) => origin.replace(/\/+$/, ''))
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of DELIVERY_KEYS) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Reads and checks environment variables; the error names every bad one. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Hosts and .env files give unset variables as empty strings.
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(present);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
  throw new Error(
    `Missing or invalid environment variables: ${names.join(', ')}. See .env.example.`,
  );
}

/** Injection token for the parsed environment. */
export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
