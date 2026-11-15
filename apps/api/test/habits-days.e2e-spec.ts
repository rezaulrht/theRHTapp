import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DaysService } from '../src/habits/days';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

/** A Dhaka wall-clock time as an instant (UTC+6, no daylight saving). */
const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);
const DAY = '2026-11-15';
const NEXT = '2026-11-16';

interface Item {
  itemId: string;
  name: string;
  points: number;
  outcome: string;
  score: number;
  skipped: boolean;
  dueAt: string;
  marks: { id: string; at: string }[];
  target: number | null;
}

describe('habit days', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let days: DaysService;
  let cookie: string;
  let ids: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'delete' | 'put', url: string) => http()[method](url).set('Cookie', cookie);
  const at = (date: string, time: string) => {
    days.clock = () => dhaka(date, time);
  };
  const report = async (day = DAY) => (await call('get', `/api/habits/days/${day}`)).body;
  const itemOf = (body: { items: Item[] }, name: string) => body.items.find((item) => item.name === name)!;
  const mark = (name: string, day = DAY, time?: Date) =>
    call('post', `/api/habits/days/${day}/marks`).send({ itemId: ids[name], ...(time ? { at: time.toISOString() } : {}) });

  const everyDay = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };
  const reminders = { channels: [], onOpen: false, onDue: false, warn: false };
  const ROUTINE = [
    { name: 'Breakfast', timing: { kind: 'fixed', due: '08:30' } },
    { name: 'Snack', timing: { kind: 'fixed', start: '11:00', due: '11:30' } },
    { name: 'Sleep', timing: { kind: 'fixed', due: '23:30' } },
    { name: 'Water', timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 } },
    { name: 'Teeth', timing: { kind: 'fixed' } },
  ];

  /** The routine, as if it had been set up on 10 November. */
  async function routine(): Promise<void> {
    ids = {};
    for (const entry of ROUTINE) {
      const res = await call('post', '/api/habits/items').send({ ...entry, points: 500, appliesTo: everyDay, reminders });
      ids[entry.name] = res.body.id;
    }
    await prisma.habitItem.updateMany({ data: { createdAt: dhaka('2026-11-10', '09:00') } });
    await prisma.habitDay.deleteMany();
    // Pretend the days before the test begins were already dealt with.
    await prisma.habitDay.create({ data: { day: new Date('2026-11-14T00:00:00Z'), closedAt: new Date() } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    days = app.get(DaysService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    at(DAY, '06:00');
    await routine();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists today in time order, everything pending', async () => {
    const body = await report();
    expect(body).toMatchObject({ day: DAY, isToday: true, closed: false, skipped: false, score: 0, possible: 2500, lost: 0, target: 1750, won: false });
    expect(body.items.map((item: Item) => item.name)).toEqual(['Breakfast', 'Water', 'Snack', 'Sleep', 'Teeth']);
    expect(body.items.every((item: Item) => item.outcome === 'pending')).toBe(true);
    expect(itemOf(body, 'Water').target).toBe(8);
    expect(itemOf(body, 'Breakfast').target).toBeNull();
    expect(new Date(itemOf(body, 'Breakfast').dueAt)).toEqual(dhaka(DAY, '08:30'));
    expect(new Date(body.prayers.fajr).getTime()).toBeLessThan(new Date(body.prayers.zuhr).getTime());
  });

  it('an item with no deadline is next without a time', async () => {
    at(DAY, '23:45');
    for (const name of ['Breakfast', 'Snack', 'Sleep']) await mark(name);
    for (let i = 0; i < 8; i++) await mark('Water');
    expect((await report()).next).toEqual({ itemId: ids.Teeth, name: 'Teeth', at: null });
  });

  it('says what is next', async () => {
    expect((await report()).next).toEqual({ itemId: ids.Breakfast, name: 'Breakfast', at: dhaka(DAY, '08:30').toISOString() });
    at(DAY, '08:20');
    const body = (await mark('Breakfast')).body;
    // Water has not opened yet, so what is next is when it opens.
    expect(body.next).toEqual({ itemId: ids.Water, name: 'Water', at: dhaka(DAY, '09:00').toISOString() });
  });

  it('a tick before the due time is on time, after it late', async () => {
    at(DAY, '08:20');
    const onTime = (await mark('Breakfast')).body;
    expect(itemOf(onTime, 'Breakfast')).toMatchObject({ outcome: 'onTime', score: 500 });
    expect(onTime.score).toBe(500);

    at(DAY, '11:50');
    const late = (await mark('Snack')).body;
    expect(itemOf(late, 'Snack')).toMatchObject({ outcome: 'late', score: 250 });
    expect(late).toMatchObject({ score: 750, lost: 250 });
  });

  it('the time of a tick can be corrected, and a tick undone', async () => {
    at(DAY, '08:50');
    const late = (await mark('Breakfast')).body;
    const id = itemOf(late, 'Breakfast').marks[0]!.id;
    expect(itemOf(late, 'Breakfast').outcome).toBe('late');

    const fixed = (await call('patch', `/api/habits/marks/${id}`).send({ at: dhaka(DAY, '08:25').toISOString() })).body;
    expect(itemOf(fixed, 'Breakfast')).toMatchObject({ outcome: 'onTime', score: 500 });

    const undone = (await call('delete', `/api/habits/marks/${id}`)).body;
    expect(itemOf(undone, 'Breakfast')).toMatchObject({ outcome: 'pending', score: 0, marks: [] });
    // And it can be ticked again.
    expect(itemOf((await mark('Breakfast')).body, 'Breakfast').marks).toHaveLength(1);
  });

  it('a one-off item keeps a single tick however often it is tapped', async () => {
    at(DAY, '08:20');
    await mark('Breakfast');
    const again = await mark('Breakfast');
    expect(again.status).toBe(201);
    expect(itemOf(again.body, 'Breakfast').marks).toHaveLength(1);
  });

  it('a repeating item takes a tick per time and never scores more than full points', async () => {
    at(DAY, '20:00');
    let body = (await mark('Water')).body;
    expect(itemOf(body, 'Water')).toMatchObject({ outcome: 'pending', score: 0 });
    for (let i = 0; i < 8; i++) body = (await mark('Water')).body;
    expect(itemOf(body, 'Water').marks).toHaveLength(9);
    expect(itemOf(body, 'Water')).toMatchObject({ outcome: 'onTime', score: 500 });
  });

  it('a tick at 1 a.m. belongs to the day that began the morning before', async () => {
    at(NEXT, '01:00');
    const res = await mark('Sleep');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ day: DAY, isToday: true });
    expect(itemOf(res.body, 'Sleep')).toMatchObject({ outcome: 'late', score: 250 });
    expect(new Date(itemOf(res.body, 'Sleep').marks[0]!.at)).toEqual(dhaka(NEXT, '01:00'));
  });

  it('when the day ends, what was not done is missed and the result is stored', async () => {
    at(DAY, '08:20');
    await mark('Breakfast');
    at(NEXT, '05:00');
    const body = await report(DAY);
    expect(body).toMatchObject({ isToday: false, closed: true, next: null });
    expect(itemOf(body, 'Breakfast')).toMatchObject({ outcome: 'onTime', score: 500 });
    expect(itemOf(body, 'Snack')).toMatchObject({ outcome: 'missed', score: -750 });
    expect(itemOf(body, 'Water')).toMatchObject({ outcome: 'missed', score: -750 });
    // 500 − 4 × 750
    expect(body).toMatchObject({ score: -2500, possible: 2500, won: false });

    const stored = await prisma.habitDayItem.findMany({ where: { day: new Date(`${DAY}T00:00:00Z`) } });
    expect(stored.map((row) => row.outcome).sort()).toEqual(['missed', 'missed', 'missed', 'missed', 'onTime']);
    expect((await prisma.habitDay.findUnique({ where: { day: new Date(`${DAY}T00:00:00Z`) } }))!.closedAt).not.toBeNull();
  });

  it('a repeating item half done is late at the end of the day', async () => {
    at(DAY, '15:00');
    for (let i = 0; i < 4; i++) await mark('Water');
    at(NEXT, '05:00');
    expect(itemOf(await report(DAY), 'Water')).toMatchObject({ outcome: 'late', score: 250 });
  });

  it('editing or removing an item later leaves past days as they were', async () => {
    at(DAY, '08:20');
    await mark('Breakfast');
    at(NEXT, '06:00');
    await report(NEXT);

    await call('patch', `/api/habits/items/${ids.Breakfast}`).send({ points: 1000, timing: { kind: 'fixed', due: '09:00' }, name: 'Big breakfast' });
    await call('patch', '/api/settings').send({ 'habits.missMultiplier': 3, 'habits.dailyTargetPercent': 50 });

    const past = await report(DAY);
    expect(itemOf(past, 'Breakfast')).toMatchObject({ points: 500, outcome: 'onTime', score: 500 });
    expect(new Date(itemOf(past, 'Breakfast').dueAt)).toEqual(dhaka(DAY, '08:30'));
    expect(itemOf(past, 'Snack').score).toBe(-750);
    expect(past.target).toBe(1750);

    const today = await report(NEXT);
    expect(itemOf(today, 'Big breakfast').points).toBe(1000);
    expect(new Date(itemOf(today, 'Big breakfast').dueAt)).toEqual(dhaka(NEXT, '09:00'));
    expect(today.target).toBe(1500);

    await call('delete', `/api/habits/items/${ids.Breakfast}`);
    expect(itemOf(await report(DAY), 'Breakfast')).toBeDefined();
    expect((await report(NEXT)).items.map((item: Item) => item.name)).not.toContain('Big breakfast');
  });

  it('a paused item leaves today and comes back when resumed', async () => {
    await report();
    await call('patch', `/api/habits/items/${ids.Snack}`).send({ paused: true });
    expect((await report()).items.map((item: Item) => item.name)).not.toContain('Snack');
    await call('patch', `/api/habits/items/${ids.Snack}`).send({ paused: false });
    expect((await report()).items.map((item: Item) => item.name)).toContain('Snack');
  });

  it('days the app was never opened on are filled in as missed, unless skipped', async () => {
    await report();
    at('2026-11-18', '06:00');
    const gap = await report('2026-11-17');
    expect(gap).toMatchObject({ closed: true, score: -3750, possible: 2500 });
    expect(gap.items.every((item: Item) => item.outcome === 'missed')).toBe(true);
    expect(await prisma.habitDay.count()).toBe(5); // 14 (placeholder), 15, 16, 17, 18

    const skipped = (await call('put', '/api/habits/days/2026-11-17/skip').send({ reason: 'Travelling' })).body;
    expect(skipped).toMatchObject({ skipped: true, skippedReason: 'Travelling', score: 0, possible: 0, won: null });
    expect(skipped.items.every((item: Item) => item.outcome === 'skipped' && item.score === 0)).toBe(true);

    const back = (await call('delete', '/api/habits/days/2026-11-17/skip')).body;
    expect(back).toMatchObject({ skipped: false, skippedReason: null, score: -3750 });
  });

  it('there is no day before the routine existed', async () => {
    await prisma.habitDay.deleteMany();
    const before = await report('2026-11-09');
    expect(before).toMatchObject({ items: [], score: 0, possible: 0, won: null, closed: true });
    expect(await prisma.habitDay.findUnique({ where: { day: new Date('2026-11-09T00:00:00Z') } })).toBeNull();
    // The first day is the one the first item was created on.
    expect((await report('2026-11-10')).items).toHaveLength(5);
  });

  it('a skipped item scores nothing and is not counted as possible', async () => {
    const res = await call('put', `/api/habits/days/${DAY}/items/${ids.Snack}/skip`);
    expect(res.status).toBe(200);
    expect(itemOf(res.body, 'Snack')).toMatchObject({ outcome: 'skipped', score: 0, skipped: true });
    expect(res.body.possible).toBe(2000);
    const back = (await call('delete', `/api/habits/days/${DAY}/items/${ids.Snack}/skip`)).body;
    expect(itemOf(back, 'Snack').outcome).toBe('pending');
    expect((await call('put', `/api/habits/days/${DAY}/items/nope/skip`)).status).toBe(404);
  });

  it('skipping today scores nothing', async () => {
    at(DAY, '08:20');
    await mark('Breakfast');
    const body = (await call('put', `/api/habits/days/${DAY}/skip`).send({})).body;
    expect(body).toMatchObject({ skipped: true, skippedReason: null, score: 0, possible: 0, won: null, next: null });
  });

  it('ticking a past day without a time counts as on time, and corrects the stored result', async () => {
    at(NEXT, '06:00');
    expect(itemOf(await report(DAY), 'Breakfast').outcome).toBe('missed');
    const body = (await mark('Breakfast', DAY)).body;
    expect(itemOf(body, 'Breakfast')).toMatchObject({ outcome: 'onTime', score: 500 });
    const stored = await prisma.habitDayItem.findFirst({ where: { day: new Date(`${DAY}T00:00:00Z`), itemId: ids.Breakfast } });
    expect(stored).toMatchObject({ outcome: 'onTime', score: 500 });

    const late = (await call('patch', `/api/habits/marks/${itemOf(body, 'Breakfast').marks[0]!.id}`).send({ at: dhaka(DAY, '10:00').toISOString() })).body;
    expect(itemOf(late, 'Breakfast')).toMatchObject({ outcome: 'late', score: 250 });
  });

  it('refuses a time off the day, a time not yet come, a future day and unknown things', async () => {
    at(DAY, '12:00');
    const off = await mark('Breakfast', DAY, dhaka('2026-11-14', '23:00'));
    expect(off.status).toBe(400);
    expect(off.body.errors[0].path).toBe('at');
    expect((await mark('Breakfast', DAY, dhaka(DAY, '18:00'))).status).toBe(400);
    expect((await mark('Breakfast', DAY, dhaka(NEXT, '04:00'))).status).toBe(400);
    expect((await report()).items.every((item: Item) => item.marks.length === 0)).toBe(true);

    expect((await call('get', `/api/habits/days/${NEXT}`)).status).toBe(400);
    expect((await call('get', '/api/habits/days/2026-02-30')).status).toBe(400);
    expect((await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: 'nope' })).status).toBe(400);
    expect((await call('delete', '/api/habits/marks/nope')).status).toBe(404);
    expect((await http().get(`/api/habits/days/${DAY}`)).status).toBe(401);
  });

  it('an item only for class days is not on a workday', async () => {
    await call('post', '/api/habits/items').send({
      name: 'Class notes',
      points: 500,
      timing: { kind: 'fixed' },
      appliesTo: { kind: 'dayTypes', dayTypeIds: ['classday'] },
      reminders,
    });
    // 15 November 2026 is a Sunday, a workday; 20 November is a Friday.
    expect((await report()).items.map((item: Item) => item.name)).not.toContain('Class notes');
    at('2026-11-20', '06:00');
    expect((await report('2026-11-20')).items.map((item: Item) => item.name)).toContain('Class notes');
  });
});
