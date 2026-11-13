import type { INestApplication } from '@nestjs/common';
import { defaultSettings } from '@pa/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

describe('settings', () => {
  let app: INestApplication;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const get = () => http().get('/api/settings').set('Cookie', cookie);
  const patch = (body: unknown) =>
    http().patch('/api/settings').set('Cookie', cookie).send(body as object);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns exactly the defaults on a fresh database', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual(defaultSettings);
  });

  it('keeps a change across requests', async () => {
    const res = await patch({ 'general.timezone': 'Asia/Karachi' });
    expect(res.status).toBe(200);
    expect(res.body['general.timezone']).toBe('Asia/Karachi');
    expect((await get()).body).toEqual({ ...defaultSettings, 'general.timezone': 'Asia/Karachi' });
  });

  it('stores only the keys that changed', async () => {
    await patch({ 'general.timezone': 'Asia/Karachi', 'general.currency': defaultSettings['general.currency'] });
    const rows = await app.get(PrismaService).setting.findMany();
    expect(rows.map((r) => r.key)).toEqual(['general.timezone']);
  });

  it('saves several settings together when they depend on each other', async () => {
    const res = await patch({
      'general.dayTypes': [
        { id: 'workday', name: 'Workday' },
        { id: 'classday', name: 'Class day' },
        { id: 'holiday', name: 'Holiday' },
      ],
      'general.weekPattern': { ...defaultSettings['general.weekPattern'], sat: 'holiday' },
    });
    expect(res.status).toBe(200);
    expect((await get()).body['general.weekPattern'].sat).toBe('holiday');
  });

  it.each([
    [{ 'general.timezone': 'Mars/Olympus' }, 'general.timezone'],
    [{ 'general.quietHours': { enabled: true, start: '25:99', end: '05:00' } }, 'general.quietHours.start'],
    [{ 'general.weekPattern': { ...defaultSettings['general.weekPattern'], fri: 'holiday' } }, 'general.weekPattern.fri'],
    [{ 'general.dayTypes': [] }, 'general.dayTypes'],
    [{ 'nope.key': 1 }, 'nope.key'],
  ])('rejects %j with 400 naming %s and saves nothing', async (body, path) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain(path);
    expect((await get()).body).toEqual(defaultSettings);
  });

  it('rejects the whole patch if one key is bad', async () => {
    const res = await patch({ 'general.timezone': 'Asia/Karachi', 'general.notificationEmail': 'not-an-email' });
    expect(res.status).toBe(400);
    expect((await get()).body).toEqual(defaultSettings);
  });

  it('needs a session', async () => {
    expect((await http().get('/api/settings')).status).toBe(401);
    expect((await http().patch('/api/settings').send({})).status).toBe(401);
  });

  it('get(key) reads one setting, falling back to its default', async () => {
    const settings = app.get(SettingsService);
    expect(await settings.get('general.timezone')).toBe('Asia/Dhaka');
    await patch({ 'general.timezone': 'Asia/Karachi' });
    expect(await settings.get('general.timezone')).toBe('Asia/Karachi');
  });

  it('ignores a stored row that is no longer a known setting', async () => {
    await app.get(PrismaService).setting.create({ data: { key: 'old.removed', value: 1 } });
    expect((await get()).body).toEqual(defaultSettings);
  });
});
