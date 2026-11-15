import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ensureHabitSeed } from '../src/habits/seed';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

describe('habit items', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'delete', url: string) => http()[method](url).set('Cookie', cookie);
  const item = (over: object = {}) => ({
    name: 'Breakfast',
    points: 500,
    timing: { kind: 'fixed', due: '08:30' },
    appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
    reminders: { channels: ['push'], onOpen: false, onDue: true, warn: true },
    ...over,
  });
  const pathOf = (res: request.Response) => res.body.errors?.[0]?.path;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a session', async () => {
    expect((await http().get('/api/habits/items')).status).toBe(401);
  });

  describe('seed', () => {
    it('creates the starting routine once', async () => {
      await ensureHabitSeed(prisma);
      await ensureHabitSeed(prisma);
      const items = (await call('get', '/api/habits/items')).body;
      expect(items).toHaveLength(16);
      expect(items[0]).toMatchObject({ name: 'Wake up', points: 500, timing: { kind: 'fixed', due: '05:30' } });
      expect(items.find((i: { name: string }) => i.name === 'Zuhr').timing).toEqual({
        kind: 'prayer',
        prayer: 'zuhr',
        start: '13:00',
        end: '13:30',
      });
      const water = items.find((i: { name: string }) => i.name === 'Drink water');
      expect(water.timing).toEqual({ kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 });
      expect(water.reminders.channels).toEqual(['push']);
    });

    it('does not bring the routine back after the owner removed all of it', async () => {
      await ensureHabitSeed(prisma);
      for (const row of (await call('get', '/api/habits/items')).body) {
        await call('delete', `/api/habits/items/${row.id}`);
      }
      await ensureHabitSeed(prisma);
      expect((await call('get', '/api/habits/items')).body).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('adds an item at the end, with no overrides', async () => {
      await call('post', '/api/habits/items').send(item());
      const res = await call('post', '/api/habits/items').send(item({ name: 'Snack', timing: { kind: 'fixed', start: '11:00', due: '11:30' } }));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Snack',
        points: 500,
        lateShare: null,
        missMultiplier: null,
        ignoreQuietHours: false,
        sortOrder: 1,
        paused: false,
        archived: false,
      });
    });

    it.each([
      [{ name: ' ' }, 'name'],
      [{ points: 0 }, 'points'],
      [{ points: 100_001 }, 'points'],
      [{ points: 2.5 }, 'points'],
      [{ timing: { kind: 'fixed', start: '09:00', due: '08:30' } }, 'timing.due'],
      [{ timing: { kind: 'fixed', due: '8:30' } }, 'timing.due'],
      [{ timing: { kind: 'repeating', start: '21:00', end: '09:00', everyMinutes: 90, target: 8 } }, 'timing.end'],
      [{ timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 4, target: 8 } }, 'timing.everyMinutes'],
      [{ timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 0 } }, 'timing.target'],
      [{ timing: { kind: 'prayer', prayer: 'noon' } }, 'timing.prayer'],
      [{ appliesTo: { kind: 'weekdays', days: [] } }, 'appliesTo.days'],
      [{ appliesTo: { kind: 'dayTypes', dayTypeIds: ['holiday'] } }, 'appliesTo.dayTypeIds'],
      [{ lateShare: 1.5 }, 'lateShare'],
      [{ reminders: { channels: ['sms'], onOpen: true, onDue: true, warn: true } }, 'reminders.channels.0'],
    ])('refuses %j and names %s', async (over, path) => {
      const res = await call('post', '/api/habits/items').send(item(over));
      expect(res.status).toBe(400);
      expect(pathOf(res)).toBe(path);
      expect((await call('get', '/api/habits/items')).body).toHaveLength(0);
    });

    it('accepts a day type the owner has', async () => {
      const res = await call('post', '/api/habits/items').send(item({ appliesTo: { kind: 'dayTypes', dayTypeIds: ['classday'] } }));
      expect(res.status).toBe(201);
    });
  });

  describe('update', () => {
    it('changes one field and leaves the rest', async () => {
      const made = (await call('post', '/api/habits/items').send(item())).body;
      const res = await call('patch', `/api/habits/items/${made.id}`).send({ points: 1000, lateShare: 0.8 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Breakfast', points: 1000, lateShare: 0.8, timing: { kind: 'fixed', due: '08:30' } });
      const cleared = await call('patch', `/api/habits/items/${made.id}`).send({ lateShare: null });
      expect(cleared.body.lateShare).toBeNull();
    });

    it('pauses and resumes', async () => {
      const made = (await call('post', '/api/habits/items').send(item())).body;
      expect((await call('patch', `/api/habits/items/${made.id}`).send({ paused: true })).body.paused).toBe(true);
      expect((await call('patch', `/api/habits/items/${made.id}`).send({ paused: false })).body.paused).toBe(false);
    });

    it('validates what it is given', async () => {
      const made = (await call('post', '/api/habits/items').send(item())).body;
      const res = await call('patch', `/api/habits/items/${made.id}`).send({ timing: { kind: 'fixed', start: '10:00', due: '09:00' } });
      expect(res.status).toBe(400);
      expect((await call('patch', '/api/habits/items/nope').send({ points: 100 })).status).toBe(404);
    });
  });

  it('removing an item archives it', async () => {
    const made = (await call('post', '/api/habits/items').send(item())).body;
    expect((await call('delete', `/api/habits/items/${made.id}`)).status).toBe(204);
    expect((await call('get', '/api/habits/items')).body).toHaveLength(0);
    const all = (await call('get', '/api/habits/items?includeArchived=1')).body;
    expect(all).toHaveLength(1);
    expect(all[0].archived).toBe(true);
    expect((await call('delete', `/api/habits/items/${made.id}`)).status).toBe(404);
  });

  it('reorders, and needs every active item named once', async () => {
    const a = (await call('post', '/api/habits/items').send(item({ name: 'A' }))).body;
    const b = (await call('post', '/api/habits/items').send(item({ name: 'B' }))).body;
    const gone = (await call('post', '/api/habits/items').send(item({ name: 'Gone' }))).body;
    await call('delete', `/api/habits/items/${gone.id}`);

    expect((await call('post', '/api/habits/items/reorder').send({ ids: [b.id] })).status).toBe(400);
    expect((await call('post', '/api/habits/items/reorder').send({ ids: [b.id, a.id] })).status).toBe(204);
    expect((await call('get', '/api/habits/items')).body.map((i: { name: string }) => i.name)).toEqual(['B', 'A']);
  });

  it('tells listeners when the routine changes', async () => {
    const { ItemsService } = await import('../src/habits/items');
    const heard = jest.fn();
    app.get(ItemsService).onChanged(heard);
    const made = (await call('post', '/api/habits/items').send(item())).body;
    await call('patch', `/api/habits/items/${made.id}`).send({ points: 100 });
    await call('delete', `/api/habits/items/${made.id}`);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  describe('prayer times', () => {
    const local = (iso: string) => new Date(new Date(iso).getTime() + 6 * 3_600_000).toISOString().slice(11, 16);

    it('are calculated for Dhaka, in order', async () => {
      const res = await call('get', '/api/habits/prayer-times?day=2026-11-15');
      expect(res.status).toBe(200);
      const order = ['fajr', 'sunrise', 'zuhr', 'asr', 'maghrib', 'isha'].map((name) => new Date(res.body[name]).getTime());
      expect([...order].sort((x, y) => x - y)).toEqual(order);
      expect(local(res.body.fajr) > '04:30' && local(res.body.fajr) < '05:30').toBe(true);
      expect(local(res.body.zuhr) > '11:30' && local(res.body.zuhr) < '12:15').toBe(true);
      expect(local(res.body.maghrib) > '17:00' && local(res.body.maghrib) < '17:30').toBe(true);
    });

    it('the standard Asr rule is earlier than Hanafi', async () => {
      const hanafi = (await call('get', '/api/habits/prayer-times?day=2026-11-15')).body.asr;
      await call('patch', '/api/settings').send({ 'habits.prayer': { method: 'Karachi', asr: 'standard' } });
      const standard = (await call('get', '/api/habits/prayer-times?day=2026-11-15')).body.asr;
      expect(new Date(standard).getTime()).toBeLessThan(new Date(hanafi).getTime());
    });

    it('needs a real day', async () => {
      expect((await call('get', '/api/habits/prayer-times?day=2026-02-30')).status).toBe(400);
    });
  });
});
