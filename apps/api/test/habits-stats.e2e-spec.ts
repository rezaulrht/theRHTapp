import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DaysService } from '../src/habits/days';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);

interface ItemStats {
  name: string;
  archived: boolean;
  lost: number;
  missed: number;
  late: number;
  onTime: number;
  applied: number;
  missRate: number;
  current: number;
  best: number;
}

describe('habit progress', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let days: DaysService;
  let cookie: string;
  let ids: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'put' | 'delete', url: string) => http()[method](url).set('Cookie', cookie);
  const at = (date: string, time: string) => {
    days.clock = () => dhaka(date, time);
  };
  const mark = (name: string, day: string, time: string) =>
    call('post', `/api/habits/days/${day}/marks`).send({ itemId: ids[name], at: dhaka(day, time).toISOString() });
  const stats = async (from: string, to: string) => (await call('get', `/api/habits/stats?from=${from}&to=${to}`)).body;
  const of = (body: { items: ItemStats[] }, name: string) => body.items.find((item) => item.name === name)!;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    days = app.get(DaysService);
  });

  /**
   * Two items since 10 November: Breakfast (due 08:30) and Walk (no time).
   *   10: breakfast on time, walk done      → +500 +500
   *   11: breakfast late, walk missed       → +250 −750
   *   12: skipped day
   *   13: breakfast on time, walk done      → +500 +500
   *   14: today (still running), breakfast done
   */
  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    at('2026-11-14', '09:00');
    ids = {};
    for (const entry of [
      { name: 'Breakfast', timing: { kind: 'fixed', due: '08:30' } },
      { name: 'Walk', timing: { kind: 'fixed' } },
    ]) {
      const res = await call('post', '/api/habits/items').send({
        ...entry,
        points: 500,
        appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
        reminders: { channels: [], onOpen: false, onDue: false, warn: false },
      });
      ids[entry.name] = res.body.id;
    }
    await prisma.habitItem.updateMany({ data: { createdAt: dhaka('2026-11-10', '05:00') } });
    await prisma.habitDay.deleteMany();

    await mark('Breakfast', '2026-11-10', '08:00');
    await mark('Walk', '2026-11-10', '18:00');
    await mark('Breakfast', '2026-11-11', '09:30');
    await call('put', '/api/habits/days/2026-11-12/skip').send({ reason: 'Sick' });
    await mark('Breakfast', '2026-11-13', '08:10');
    await mark('Walk', '2026-11-13', '17:00');
    await mark('Breakfast', '2026-11-14', '08:20');
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives each day its score, today included as it stands', async () => {
    const body = await stats('2026-11-10', '2026-11-14');
    expect(body.days).toEqual([
      { day: '2026-11-10', score: 1000, possible: 1000, target: 700, won: true, skipped: false },
      { day: '2026-11-11', score: -500, possible: 1000, target: 700, won: false, skipped: false },
      { day: '2026-11-12', score: 0, possible: 0, target: 0, won: null, skipped: true },
      { day: '2026-11-13', score: 1000, possible: 1000, target: 700, won: true, skipped: false },
      { day: '2026-11-14', score: 500, possible: 1000, target: 700, won: false, skipped: false },
    ]);
  });

  it('ranks the items that lost most first, with their miss rate', async () => {
    const body = await stats('2026-11-10', '2026-11-14');
    expect(body.items.map((item: ItemStats) => item.name)).toEqual(['Walk', 'Breakfast']);
    // Walk: missed once in three counted days, giving up 500 + 750.
    expect(of(body, 'Walk')).toMatchObject({ lost: 1250, missed: 1, late: 0, onTime: 2, applied: 3, archived: false });
    expect(of(body, 'Walk').missRate).toBeCloseTo(1 / 3);
    // Breakfast: late once, giving up 250.
    expect(of(body, 'Breakfast')).toMatchObject({ lost: 250, missed: 0, late: 1, onTime: 2, applied: 3, missRate: 0 });
  });

  it('a streak runs across a skipped day, resets on a miss, and counts today once done', async () => {
    const body = await stats('2026-11-10', '2026-11-14');
    // Breakfast: done 10, 11 (late counts), skipped 12, done 13, done today.
    expect(of(body, 'Breakfast')).toMatchObject({ current: 4, best: 4 });
    // Walk: done 10, missed 11, skipped 12, done 13, not yet today.
    expect(of(body, 'Walk')).toMatchObject({ current: 1, best: 1 });
  });

  it('streaks use the whole history even when the range is short', async () => {
    const body = await stats('2026-11-13', '2026-11-13');
    expect(body.days).toHaveLength(1);
    expect(of(body, 'Breakfast')).toMatchObject({ applied: 1, current: 4, best: 4 });
  });

  it('marks an item that has been removed, and keeps it in the ranking', async () => {
    await call('delete', `/api/habits/items/${ids.Walk}`);
    const body = await stats('2026-11-10', '2026-11-13');
    expect(of(body, 'Walk')).toMatchObject({ archived: true, lost: 1250 });
  });

  it('a range with no days is empty', async () => {
    expect(await stats('2026-10-01', '2026-10-31')).toEqual({ days: [], items: [] });
  });

  it('refuses a bad range', async () => {
    expect((await call('get', '/api/habits/stats?from=2026-11-10')).status).toBe(400);
    expect((await call('get', '/api/habits/stats?from=2026-11-10&to=2026-11-01')).status).toBe(400);
    expect((await call('get', '/api/habits/stats?from=2025-11-10&to=2026-11-14')).status).toBe(400);
    expect((await call('get', '/api/habits/stats?from=2025-11-14&to=2026-11-14')).status).toBe(200);
    expect((await http().get('/api/habits/stats?from=2026-11-10&to=2026-11-14')).status).toBe(401);
  });

  it('sums up today for the Today page', async () => {
    const res = await call('get', '/api/habits/today');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ day: '2026-11-14', score: 500, possible: 1000, target: 700, won: false, done: 1, total: 2, skipped: false });
    expect(res.body.next).toMatchObject({ name: 'Walk' });
  });

  it('today with no routine at all is empty, not an error', async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    const res = await call('get', '/api/habits/today');
    expect(res.body).toMatchObject({ score: 0, possible: 0, won: null, next: null, done: 0, total: 0 });
  });

  it('the export holds the routine, the days and the ticks', async () => {
    const res = await call('get', '/api/export');
    expect(res.status).toBe(200);
    const habits = res.body.habits;
    expect(habits.items).toHaveLength(2);
    expect(habits.days).toHaveLength(5);
    expect(habits.dayItems).toHaveLength(10);
    expect(habits.marks).toHaveLength(6);
  });
});
