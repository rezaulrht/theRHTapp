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
