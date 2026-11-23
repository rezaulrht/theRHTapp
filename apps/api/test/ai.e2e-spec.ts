import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const KEY = 'sk-test-0123456789abcdef';

describe('assistant key', () => {
  let app: INestApplication;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const status = () => http().get('/api/ai/status').set('Cookie', cookie);
  const save = (key: unknown) => http().put('/api/ai/key').set('Cookie', cookie).send({ key });

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await app.close();
  });

  it('is off until a key is saved, then on, then off again once it is removed', async () => {
    expect((await status()).body).toEqual({ enabled: false, source: null, hint: null });

    expect((await save(KEY)).status).toBe(204);
    expect((await status()).body).toEqual({ enabled: true, source: 'settings', hint: 'cdef' });

    expect((await http().delete('/api/ai/key').set('Cookie', cookie)).status).toBe(204);
    expect((await status()).body).toEqual({ enabled: false, source: null, hint: null });
  });

  it('keeps the key encrypted and never sends it back', async () => {
    await save(KEY);
    const rows = await app.get(PrismaService).setting.findMany();
    expect(JSON.stringify(rows)).not.toContain(KEY);

    const responses = [
      await status(),
      await http().get('/api/settings').set('Cookie', cookie),
      await http().get('/api/export').set('Cookie', cookie),
    ];
    for (const res of responses) expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it('refuses something that is not a key, and anyone who is not logged in', async () => {
    expect((await save('short')).status).toBe(400);
    expect((await save(undefined)).status).toBe(400);
    expect((await http().get('/api/ai/status')).status).toBe(401);
    expect((await http().put('/api/ai/key').send({ key: KEY })).status).toBe(401);
  });

  it('says the assistant is not set up when parsing without a key', async () => {
    const res = await http().post('/api/ai/parse-expense').set('Cookie', cookie).send({ text: 'Lunch 250' });
    expect(res.status).toBe(503);
  });

  it('reads a sentence with the saved key and matches the account and category by name', async () => {
    const account = await http().post('/api/money/accounts').set('Cookie', cookie).send({ name: 'bKash', openingBalance: 0, openingDate: '2026-01-01' });
    const category = await http().post('/api/money/categories').set('Cookie', cookie).send({ name: 'Food', color: 'coral', icon: 'food' });
    await save(KEY);

    const send = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"Lunch","amount":250,"account":"bKash","category":"Food","date":null}' } }] }), { status: 200 }),
    );
    const res = await http().post('/api/ai/parse-expense').set('Cookie', cookie).send({ text: 'Lunch 250 bkash' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Lunch', amount: 25000, accountId: account.body.id, categoryId: category.body.id });
    expect((send.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });
});
