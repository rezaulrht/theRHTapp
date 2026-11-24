import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const KEY = 'sk-test-0123456789abcdef';
const today = () => new Date().toISOString().slice(0, 10);

describe('assistant actions', () => {
  let app: INestApplication;
  let cookie: string;
  let fetchSpy: jest.SpyInstance;
  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object = {}) => http().post(`/api/${path}`).set('Cookie', cookie).send(body);

  function model(...contents: string[]) {
    fetchSpy.mockReset();
    for (const content of contents) {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    model();
    await http().put('/api/ai/key').set('Cookie', cookie).send({ key: KEY });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });

  const account = async (name: string) =>
    (await post('money/accounts', { name, openingBalance: 0, openingDate: '2026-01-01' })).body.id as string;
  const category = async (name: string) => (await post('money/categories', { name, color: 'coral', icon: 'food' })).body.id as string;
  const habit = async (name: string) =>
    (
      await post('habits/items', {
        name,
        points: 500,
        timing: { kind: 'fixed', due: '23:00' },
        appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
        reminders: { channels: [], onOpen: false, onDue: false, warn: false },
      })
    ).body.id as string;

  it('proposes actions from what was asked, and changes nothing until they are confirmed', async () => {
    await habit('Gym');
    const food = await category('Food');
    await account('Cash');

    model('{"type":"action"}', JSON.stringify({ actions: [{ type: 'mark_habit_done', item: 'gym' }, { type: 'set_budget', category: 'Food', amount: 8000 }, { type: 'mark_habit_done', item: 'Swimming' }] }));
    const res = await post('ai/ask', { text: 'mark gym done and set the food budget to 8000' });

    expect(res.body.type).toBe('actions');
    expect(res.body.actions.map((action: { summary: string }) => action.summary)).toEqual(['Mark Gym as done today', 'Set the food budget to ৳8,000 a month']);
    expect(res.body.notes).toEqual(['There is no habit called "Swimming" on your routine.']);
    expect(res.body.actions[1].payload).toMatchObject({ categoryId: food, amount: 800000 });

    // Asking changed nothing.
    expect((await http().get('/api/habits/today').set('Cookie', cookie)).body.done).toBe(0);
    expect((await http().get('/api/money/budgets').set('Cookie', cookie)).body).toEqual([]);
  });

  it('does what was confirmed, through the same rules as the screens', async () => {
    await habit('Gym');
    await habit('Reading');
    const cash = await account('Cash');
    const food = await category('Food');
    const transport = await category('Transport');
    const entry = (await post('money/entries', { kind: 'expense', name: 'Lunch', amount: 25000, accountId: cash, categoryId: transport, date: today() })).body.id as string;

    model('{"type":"action"}', JSON.stringify({
      actions: [
        { type: 'mark_habit_done', item: 'Gym' },
        { type: 'recategorize_entry', entry: 'Lunch', category: 'Food' },
        { type: 'add_expense', name: 'Tea', amount: 20, account: 'Cash', category: 'Food' },
        { type: 'add_income', name: 'Salary', amount: 5000, account: 'Cash' },
        { type: 'set_budget', category: 'Food', amount: 8000 },
        { type: 'pause_habit', item: 'Reading' },
      ],
    }));
    const proposed = await post('ai/ask', { text: 'do all this' });
    const results = await post('ai/act', { actions: proposed.body.actions.map((action: { payload: object }) => action.payload) });

    expect(results.status).toBe(200);
    expect(results.body.results.every((result: { ok: boolean }) => result.ok)).toBe(true);
    expect((await http().get('/api/habits/today').set('Cookie', cookie)).body.done).toBe(1);
    const entries = (await http().get(`/api/money/entries?from=${today()}&to=${today()}`).set('Cookie', cookie)).body as { id: string; categoryId: string; name: string; kind: string }[];
    expect(entries.find((item) => item.id === entry)?.categoryId).toBe(food);
    expect(entries.map((item) => `${item.kind}:${item.name}`).sort()).toEqual(['expense:Lunch', 'expense:Tea', 'income:Salary']);
    expect((await http().get('/api/money/budgets').set('Cookie', cookie)).body).toEqual([{ categoryId: food, amount: 800000 }]);
    const items = (await http().get('/api/habits/items').set('Cookie', cookie)).body as { name: string; paused: boolean }[];
    expect(items.find((item) => item.name === 'Reading')?.paused).toBe(true);
    expect(items.find((item) => item.name === 'Gym')?.paused).toBe(false);
  });

  it('reports a failed action by itself and still does the others', async () => {
    const cash = await account('Cash');
    const food = await category('Food');
    const results = await post('ai/act', {
      actions: [
        { type: 'mark_habit_done', itemId: 'no-such-item', day: today(), label: 'Ghost' },
        { type: 'add_expense', name: 'Tea', amount: 2000, accountId: cash, categoryId: food, date: today(), label: 'Tea' },
      ],
    });
    expect(results.body.results[0].ok).toBe(false);
    expect(results.body.results[0].message).toContain('Ghost');
    expect(results.body.results[1]).toEqual({ ok: true, message: 'Added expense Tea' });
  });

  it('refuses an action that is not on the list, or is malformed, and anyone not logged in', async () => {
    expect((await post('ai/act', { actions: [{ type: 'delete_entry', entryId: 'e1' }] })).status).toBe(400);
    expect((await post('ai/act', { actions: [{ type: 'add_expense', name: 'x', amount: -1, accountId: 'a', categoryId: 'c', date: today() }] })).status).toBe(400);
    expect((await post('ai/act', { actions: [] })).status).toBe(400);
    expect((await post('ai/act', { actions: Array.from({ length: 11 }, () => ({ type: 'pause_habit', itemId: 'x' })) })).status).toBe(400);
    expect((await http().post('/api/ai/act').send({ actions: [{ type: 'pause_habit', itemId: 'x' }] })).status).toBe(401);
    expect(await app.get(PrismaService).moneyEntry.count()).toBe(0);
  });

  it('explains what it can do when asked for something it cannot, such as deleting', async () => {
    model('{"type":"action"}', '{"actions":[]}');
    const res = await post('ai/ask', { text: 'delete all my expenses' });
    expect(res.body.type).toBe('answer');
    expect(res.body.text).toContain('I can tick or skip habits');
  });
});
