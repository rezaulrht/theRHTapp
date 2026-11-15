import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DaysService } from '../src/habits/days';
import { HabitRemindersService, pointsText } from '../src/habits/habit-reminders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReminderEngineService } from '../src/reminders/reminder-engine.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);
const DAY = '2026-11-15';

describe('habit reminders', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let days: DaysService;
  let planner: HabitRemindersService;
  let engine: ReminderEngineService;
  let cookie: string;
  let ids: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) => http()[method](url).set('Cookie', cookie);
  const at = (time: string, date = DAY) => {
    days.clock = () => dhaka(date, time);
  };
  const everyDay = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };
  const push = { channels: ['push'], onOpen: true, onDue: true, warn: true };

  async function add(name: string, timing: object, reminders: object = push, extra: object = {}): Promise<void> {
    const res = await call('post', '/api/habits/items').send({ name, points: 500, timing, appliesTo: everyDay, reminders, ...extra });
    ids[name] = res.body.id;
  }
  /** Pending habit reminders as "HH:mm title", in time order. */
  async function planned(): Promise<string[]> {
    const rows = await prisma.reminder.findMany({ where: { ownerType: 'habit', nextFireAt: { not: null } }, orderBy: { nextFireAt: 'asc' } });
    return rows.map((row) => `${new Date(row.nextFireAt!.getTime() + 6 * 3_600_000).toISOString().slice(11, 16)} ${row.title}`);
  }
  async function statuses(title: string): Promise<string[]> {
    const rows = await prisma.reminderDelivery.findMany({ where: { reminder: { title } } });
    return rows.map((row) => row.status);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    days = app.get(DaysService);
    planner = app.get(HabitRemindersService);
    engine = app.get(ReminderEngineService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    ids = {};
    at('06:00');
  });

  afterAll(async () => {
    await app.close();
  });

  it('plans the moments an item asks for, and nothing already past', async () => {
    await add('Breakfast', { kind: 'fixed', due: '08:30' });
    await add('Snack', { kind: 'fixed', start: '11:00', due: '11:30' });
    await add('Wake up', { kind: 'fixed', due: '05:30' });
    expect(await planned()).toEqual([
      '08:20 Breakfast: 10 minutes left',
      '08:30 Breakfast is due now',
      '11:00 Time for Snack',
      '11:20 Snack: 10 minutes left',
      '11:30 Snack is due now',
    ]);
  });

  it('carries the item’s channels and quiet-hours choice', async () => {
    await add('Fajr', { kind: 'fixed', due: '07:00' }, { channels: ['push', 'email'], onOpen: false, onDue: true, warn: false }, { ignoreQuietHours: true });
    const row = await prisma.reminder.findFirstOrThrow({ where: { ownerType: 'habit' } });
    expect(row).toMatchObject({ ownerId: ids.Fajr, channels: ['push', 'email'], ignoreQuietHours: true, url: '/habits' });
  });

  it('plans nothing for an item with no channels, no deadline, or moments switched off', async () => {
    await add('Quiet', { kind: 'fixed', due: '09:00' }, { channels: [], onOpen: true, onDue: true, warn: true });
    await add('Teeth', { kind: 'fixed' });
    await add('Off', { kind: 'fixed', due: '10:00' }, { channels: ['push'], onOpen: false, onDue: false, warn: false });
    expect(await planned()).toEqual([]);
  });

  it('a prayer is announced when it opens; Isha has no deadline to warn about', async () => {
    await add('Isha', { kind: 'prayer', prayer: 'isha' });
    const rows = await planned();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^1[89]:\d\d Time for Isha$/);
  });

  it('a repeating item nudges at each interval still ahead', async () => {
    at('13:00');
    await add('Water', { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 180, target: 4 }, { channels: ['push'], onOpen: false, onDue: false, warn: false });
    expect(await planned()).toEqual(['15:00 Water', '18:00 Water', '21:00 Water']);
  });

  it('plans again when an item, the warning lead or a skip changes', async () => {
    await add('Breakfast', { kind: 'fixed', due: '08:30' });
    await call('patch', `/api/habits/items/${ids.Breakfast}`).send({ timing: { kind: 'fixed', due: '09:00' } });
    expect(await planned()).toEqual(['08:50 Breakfast: 10 minutes left', '09:00 Breakfast is due now']);

    await call('patch', '/api/settings').send({ 'habits.warnLeadMinutes': 30 });
    expect(await planned()).toEqual(['08:30 Breakfast: 30 minutes left', '09:00 Breakfast is due now']);

    await call('put', `/api/habits/days/${DAY}/items/${ids.Breakfast}/skip`);
    expect(await planned()).toEqual([]);
    await call('delete', `/api/habits/days/${DAY}/items/${ids.Breakfast}/skip`);
    expect(await planned()).toHaveLength(2);

    await call('put', `/api/habits/days/${DAY}/skip`).send({});
    expect(await planned()).toEqual([]);
  });

  it('does not send for an item already ticked, and records it as not needed', async () => {
    await add('Breakfast', { kind: 'fixed', due: '08:30' });
    await add('Gym', { kind: 'fixed', due: '08:30' }, { channels: ['push'], onOpen: false, onDue: true, warn: false });
    at('08:00');
    await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: ids.Breakfast });

    at('08:30');
    await engine.tick(dhaka(DAY, '08:30'));
    expect(await statuses('Breakfast is due now')).toEqual(['skipped']);
    expect(await statuses('Breakfast: 10 minutes left')).toEqual(['skipped']);
    // Gym was not ticked: it is attempted (and fails only because no phone is subscribed in tests).
    expect(await statuses('Gym is due now')).toEqual(['failed']);
  });

  it('stops nudging a repeating item once its target is reached', async () => {
    await add('Water', { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 360, target: 2 }, { channels: ['push'], onOpen: false, onDue: false, warn: false });
    at('09:00');
    await engine.tick(dhaka(DAY, '09:00'));
    at('10:00');
    await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: ids.Water });
    await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: ids.Water });
    at('15:00');
    await engine.tick(dhaka(DAY, '15:00'));
    expect((await statuses('Water')).sort()).toEqual(['failed', 'skipped']);
  });

  it('keeps reminders that have already gone out when it plans again', async () => {
    await add('Breakfast', { kind: 'fixed', due: '08:30' }, { channels: ['push'], onOpen: false, onDue: true, warn: false });
    at('08:30');
    await engine.tick(dhaka(DAY, '08:30'));
    at('09:00');
    await planner.plan();
    expect(await statuses('Breakfast is due now')).toEqual(['failed']);
  });

  it('sends a summary of the day, written when it is sent', async () => {
    await call('patch', '/api/settings').send({ 'habits.daySummary': { enabled: true, time: '22:30', channels: ['push'] } });
    const quiet = { channels: [], onOpen: false, onDue: false, warn: false };
    await add('Breakfast', { kind: 'fixed', due: '08:30' }, quiet);
    await add('Snack', { kind: 'fixed', start: '11:00', due: '11:30' }, quiet);
    await add('Lunch', { kind: 'fixed', due: '14:00' }, quiet, { missMultiplier: 0 });
    expect(await planned()).toEqual(['22:30 Your day']);

    at('08:00');
    await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: ids.Breakfast });
    at('12:00');
    await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: ids.Snack });
    at('15:00');
    await call('post', `/api/habits/days/${DAY}/marks`).send({ itemId: ids.Lunch });

    at('22:30');
    await engine.tick(dhaka(DAY, '22:30'));
    const row = await prisma.reminder.findFirstOrThrow({ where: { ownerId: 'summary' } });
    // 500 + 250 + 250 of 1500; Snack and Lunch each gave up 2.5.
    // Equal losses stay in the order of the day.
    expect(row.body).toBe('Score 10 of 15. Lost most: Snack (−2.5), Lunch (−2.5).');
    expect(await statuses('Your day')).toEqual(['failed']);
  });

  it('writes points the way they are read', () => {
    expect(pointsText(500)).toBe('5');
    expect(pointsText(250)).toBe('2.5');
    expect(pointsText(-750)).toBe('−7.5');
    expect(pointsText(125)).toBe('1.25');
    expect(pointsText(0)).toBe('0');
    expect(pointsText(1000)).toBe('10');
  });
});
