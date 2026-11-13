import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createOwner } from '../src/auth/owner';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, OWNER, resetDb } from './helpers';

describe('auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const login = (password: string = OWNER.password, email: string = OWNER.email) =>
    http().post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    await createOwner(prisma, OWNER.email, OWNER.password);
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with the right password and sets an httpOnly cookie', async () => {
    const res = await login();
    expect(res.status).toBe(204);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^pa_session=[\w-]{40,};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('accepts the email in any letter case', async () => {
    expect((await login(OWNER.password, OWNER.email.toUpperCase())).status).toBe(204);
  });

  it('me returns the owner email with a session and 401 without', async () => {
    await resetDb(app);
    const cookie = await loginAsOwner(app);
    const ok = await http().get('/api/auth/me').set('Cookie', cookie);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ email: OWNER.email });
    expect((await http().get('/api/auth/me')).status).toBe(401);
    expect((await http().get('/api/auth/me').set('Cookie', 'pa_session=made-up')).status).toBe(401);
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    const wrong = await login('not the password');
    const unknown = await login(OWNER.password, 'someone@example.test');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe('Email or password is wrong');
    expect(unknown.body.message).toBe('Email or password is wrong');
  });

  it('rejects a body with missing fields as 400', async () => {
    expect((await http().post('/api/auth/login').send({ email: OWNER.email })).status).toBe(400);
  });

  it('locks after five wrong attempts, even for the right password', async () => {
    for (let i = 0; i < 5; i++) expect((await login('wrong')).status).toBe(401);
    const res = await login();
    expect(res.status).toBe(423);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it('a successful login resets the failure count', async () => {
    for (let i = 0; i < 4; i++) await login('wrong');
    expect((await login()).status).toBe(204);
    for (let i = 0; i < 4; i++) await login('wrong');
    expect((await login()).status).toBe(204);
  });

  it('logout ends the session', async () => {
    await resetDb(app);
    const cookie = await loginAsOwner(app);
    const out = await http().post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('an expired session is rejected', async () => {
    await resetDb(app);
    const cookie = await loginAsOwner(app);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('a session unused for over a day is extended and the cookie re-sent', async () => {
    await resetDb(app);
    const cookie = await loginAsOwner(app);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    const soon = new Date(Date.now() + 3600 * 1000);
    await prisma.session.updateMany({ data: { lastUsedAt: twoDaysAgo, expiresAt: soon } });
    const res = await http().get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/^pa_session=/);
    const session = await prisma.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });

  it('a recently used session does not re-send the cookie', async () => {
    await resetDb(app);
    const cookie = await loginAsOwner(app);
    const res = await http().get('/api/auth/me').set('Cookie', cookie);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  describe('change password', () => {
    it('rejects a new password under 10 characters', async () => {
      await resetDb(app);
      const cookie = await loginAsOwner(app);
      const res = await http()
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: OWNER.password, newPassword: '123456789' });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].path).toBe('newPassword');
    });

    it('rejects a wrong current password', async () => {
      await resetDb(app);
      const cookie = await loginAsOwner(app);
      const res = await http()
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'nope nope nope', newPassword: 'a brand new password' });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].path).toBe('currentPassword');
    });

    it('changes the password, keeps this session, and ends the others', async () => {
      await resetDb(app);
      const cookie = await loginAsOwner(app);
      const other = String((await login()).headers['set-cookie']).split(';')[0]!;
      const res = await http()
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: OWNER.password, newPassword: 'a brand new password' });
      expect(res.status).toBe(204);
      expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
      expect((await http().get('/api/auth/me').set('Cookie', other)).status).toBe(401);
      expect((await login()).status).toBe(401);
      expect((await login('a brand new password')).status).toBe(204);
    });
  });

  it('answers 401, not 404, for an unknown route without a session', async () => {
    expect((await http().get('/api/does-not-exist')).status).toBe(401);
  });

  it('answers 404 for an unknown route with a session', async () => {
    await resetDb(app);
    const cookie = await loginAsOwner(app);
    expect((await http().get('/api/does-not-exist').set('Cookie', cookie)).status).toBe(404);
  });

  it('health stays public', async () => {
    expect((await http().get('/api/health')).status).toBe(200);
  });

  describe('createOwner', () => {
    it('refuses a second owner', async () => {
      await expect(createOwner(prisma, 'two@example.test', 'another password')).rejects.toThrow(
        /already exists/,
      );
    });

    it('resets the password and ends all sessions when asked', async () => {
      const cookie = String((await login()).headers['set-cookie']).split(';')[0]!;
      await createOwner(prisma, OWNER.email, 'reset to this password', { resetPassword: true });
      expect((await http().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
      expect((await login('reset to this password')).status).toBe(204);
    });

    it('refuses a short password', async () => {
      await resetDb(app);
      await expect(createOwner(prisma, OWNER.email, 'short')).rejects.toThrow(/10 characters/);
    });
  });
});
