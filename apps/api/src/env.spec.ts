import { loadEnv } from './env';

describe('loadEnv', () => {
  it('fills defaults', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SESSION_COOKIE_NAME).toBe('pa_session');
  });

  it('reads PORT as a number', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', PORT: '8080' });
    expect(env.PORT).toBe(8080);
  });

  it('names the missing variable', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});

describe('loadEnv delivery settings', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
  const delivery = {
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    VAPID_SUBJECT: 'mailto:me@example.test',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Personal <reminders@example.test>',
    WEB_ORIGIN: 'https://app.example.test',
  };

  it('are optional outside production', () => {
    expect(loadEnv(base).VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it('are all required in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /VAPID_PUBLIC_KEY.*VAPID_PRIVATE_KEY.*VAPID_SUBJECT.*RESEND_API_KEY.*EMAIL_FROM.*WEB_ORIGIN/,
    );
    expect(loadEnv({ ...base, ...delivery, NODE_ENV: 'production' }).WEB_ORIGIN).toBe(
      'https://app.example.test',
    );
  });

  it('strips a trailing slash from WEB_ORIGIN', () => {
    expect(loadEnv({ ...base, WEB_ORIGIN: 'https://app.example.test/' }).WEB_ORIGIN).toBe(
      'https://app.example.test',
    );
  });
});
