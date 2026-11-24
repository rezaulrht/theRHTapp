import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const KEY = 'sk-test-0123456789abcdef';

describe('assistant features', () => {
  let app: INestApplication;
  let cookie: string;
  let fetchSpy: jest.SpyInstance;
  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object = {}) => http().post(`/api/ai/${path}`).set('Cookie', cookie).send(body);
  const sent = () => fetchSpy.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

  /** Makes the model answer with these texts, one per call, in order. */
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
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });

  const setKey = () => http().put('/api/ai/key').set('Cookie', cookie).send({ key: KEY });
  const account = async (name: string) =>
    (await http().post('/api/money/accounts').set('Cookie', cookie).send({ name, openingBalance: 0, openingDate: '2026-01-01' })).body.id as string;
  const category = async (name: string) =>
    (await http().post('/api/money/categories').set('Cookie', cookie).send({ name, color: 'coral', icon: 'food' })).body.id as string;

  it('needs a login and a saved key', async () => {
    expect((await http().post('/api/ai/ask').send({ text: 'hi' })).status).toBe(401);
    expect((await post('ask', { text: 'How much did I spend?', scope: 'money' })).status).toBe(503);
    expect((await post('suggest-category', { name: 'tea' })).status).toBe(503);
  });

  it('suggests a category for a name, and only from the real categories', async () => {
    await setKey();
    const transport = await category('Transport');
    await category('Food');
    model('{"category":"Transport"}');
    expect((await post('suggest-category', { name: 'rickshaw' })).body).toEqual({ categoryId: transport });
    model('{"category":"Pets"}');
    expect((await post('suggest-category', { name: 'dog food' })).body).toEqual({ categoryId: null });
    expect(sent()[0].max_tokens).toBeLessThanOrEqual(40);
  });

  it('reads a pasted list into expenses for checking, and refuses a list with no amounts', async () => {
    await setKey();
    const bkash = await account('bKash');
    const food = await category('Food');
    model('{"items":[{"name":"Tea","amount":20,"category":"Food"},{"name":"Taxi","amount":90,"account":"bKash"}]}');
    const res = await post('parse-expenses', { text: 'tea 20\ntaxi 90 bkash' });
    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([
      { name: 'Tea', amount: 2000, categoryId: food },
      { name: 'Taxi', amount: 9000, accountId: bkash },
    ]);

    model('{"items":[]}');
    expect((await post('parse-expenses', { text: 'hello' })).status).toBe(422);
    // Nothing was saved by reading.
    expect((await http().get('/api/money/entries?from=2000-01-01&to=2099-12-31').set('Cookie', cookie)).body).toEqual([]);
  });

  it('answers a question from the real numbers, and sends the model no secrets', async () => {
    await setKey();
    const cash = await account('Cash');
    const food = await category('Food');
    await http()
      .post('/api/money/entries')
      .set('Cookie', cookie)
      .send({ kind: 'expense', name: 'Lunch', amount: 25000, accountId: cash, categoryId: food, date: new Date().toISOString().slice(0, 10) });

    model('{"type":"question"}', 'You spent 250 on Food this month.');
    const res = await post('ask', { text: 'How much on food this month?' });
    expect(res.body).toEqual({ type: 'answer', text: 'You spent 250 on Food this month.' });

    const [router, answer] = sent();
    expect(router.messages[1].content).toBe('How much on food this month?');
    const prompt = answer.messages.map((message: { content: string }) => message.content).join('\n');
    expect(prompt).toContain('MONEY');
    expect(prompt).toContain('HABITS');
    expect(prompt).toContain('Lunch');
    expect(JSON.stringify(sent())).not.toContain(KEY);
    expect(prompt).not.toContain('passwordHash');
  });

  it('a money-only box skips the sorting call and sends only its own data', async () => {
    await setKey();
    model('Nothing yet.');
    const res = await post('ask', { text: 'What did I spend?', scope: 'money' });
    expect(res.body.type).toBe('answer');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const prompt = sent()[0].messages[1].content as string;
    expect(prompt).toContain('MONEY');
    expect(prompt).not.toContain('HABITS');
  });

  it('turns a reminder request into a preview, and creates the reminder only when confirmed', async () => {
    await setKey();
    model('{"type":"reminder","title":"Pay rent","when":"2099-12-05T09:00"}');
    const res = await post('ask', { text: 'remind me to pay rent on 5 Dec at 9am' });
    expect(res.body).toMatchObject({ type: 'reminder', title: 'Pay rent', at: '2099-12-05T03:00:00.000Z' });
    expect(await app.get(PrismaService).reminder.count()).toBe(0);

    const created = await post('create-reminder', { title: res.body.title, at: res.body.at });
    expect(created.status).toBe(201);
    const row = await app.get(PrismaService).reminder.findFirstOrThrow();
    expect(row).toMatchObject({ title: 'Pay rent', ownerType: 'system', channels: ['push'] });
  });

  it('says it could not work out a time in the past instead of creating something wrong', async () => {
    await setKey();
    model('{"type":"reminder","title":"Pay rent","when":"2020-01-01T09:00"}');
    const res = await post('ask', { text: 'remind me to pay rent' });
    expect(res.body.type).toBe('answer');
    expect(await app.get(PrismaService).reminder.count()).toBe(0);
  });

  it('turns spending typed into the ask box into expenses to confirm', async () => {
    await setKey();
    await account('Cash');
    model('{"type":"expense"}', '{"items":[{"name":"Lunch","amount":250}]}');
    const res = await post('ask', { text: 'lunch 250' });
    expect(res.body).toMatchObject({ type: 'expense', items: [{ name: 'Lunch', amount: 25000 }] });
  });

  it('explains the budget pace, or says no budget is set without spending anything', async () => {
    await setKey();
    const none = await http().get('/api/ai/budget-advice').set('Cookie', cookie);
    expect(none.body.text).toContain('No budgets are set');
    expect(fetchSpy).not.toHaveBeenCalled();

    const food = await category('Food');
    await http().put('/api/money/budgets').set('Cookie', cookie).send({ categoryId: food, amount: 500000 });
    model('Food is fine so far.');
    const res = await http().get('/api/ai/budget-advice').set('Cookie', cookie);
    expect(res.body).toEqual({ text: 'Food is fine so far.' });
    expect(sent()[0].messages[1].content).toContain('projectedAtMonthEnd');
  });

  it('does not coach on too few days, and does not call the model for it', async () => {
    await setKey();
    const res = await post('habit-coach');
    expect(res.body.text).toContain('not enough finished days');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes a day summary', async () => {
    await setKey();
    model('A quiet day.');
    expect((await post('day-summary', {})).body).toEqual({ text: 'A quiet day.' });
    expect((await post('day-summary', { day: 'yesterday' })).status).toBe(400);
  });

  it('proposes a routine from a description, without adding anything to the routine', async () => {
    await setKey();
    model('{"items":[{"name":"Gym","points":10,"kind":"fixed","due":"07:30"},{"name":"Bad","points":0,"kind":"fixed"}]}');
    const res = await post('routine', { description: 'gym every morning' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: 'Gym', points: 1000 });
    expect((await http().get('/api/habits/items').set('Cookie', cookie)).body).toEqual([]);
  });

  it('sends a weekly review now through the reminder channels, from money and habits only', async () => {
    await setKey();
    model('A good week.');
    const res = await post('weekly-review/now');
    expect(res.body).toEqual({ text: 'A good week.' });
    expect(await app.get(PrismaService).reminder.findFirstOrThrow({ where: { title: 'Your week' } })).toMatchObject({ body: 'A good week.' });
    const prompt = sent()[0].messages[1].content as string;
    expect(prompt).toContain('spentThisWeek');
    expect(prompt.toLowerCase()).not.toContain('vault');
  });

  it('keeps the weekly review settings and refuses nonsense for them', async () => {
    const good = await http()
      .patch('/api/settings')
      .set('Cookie', cookie)
      .send({ 'ai.weeklyReview': { enabled: true, day: 5, time: '19:30', channels: ['push', 'email'] } });
    expect(good.status).toBe(200);
    const bad = await http()
      .patch('/api/settings')
      .set('Cookie', cookie)
      .send({ 'ai.weeklyReview': { enabled: true, day: 9, time: '25:00', channels: [] } });
    expect(bad.status).toBe(400);
  });
});
