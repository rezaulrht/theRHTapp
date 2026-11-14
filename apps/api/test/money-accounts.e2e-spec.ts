import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ensureMoneySeed } from '../src/money/seed';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

describe('money accounts and categories', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Cookie', cookie);
  const account = (over: object = {}) => ({ name: 'Savings', openingBalance: 500000, openingDate: '2026-11-01', ...over });

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

  describe('seed', () => {
    it('creates the starting accounts and categories once', async () => {
      await ensureMoneySeed(prisma);
      await ensureMoneySeed(prisma);
      const accounts = (await call('get', '/api/money/accounts')).body;
      const categories = (await call('get', '/api/money/categories')).body;
      expect(accounts.map((a: { name: string }) => a.name)).toEqual(['Bank', 'bKash', 'Cash']);
      expect(categories.map((c: { name: string }) => c.name)).toEqual(['Travel', 'Food', 'Study', 'Bills', 'Fees', 'Other']);
      expect(categories.filter((c: { isFees: boolean }) => c.isFees)).toHaveLength(1);
    });

    it('does not add anything once the owner has their own', async () => {
      await call('post', '/api/money/accounts').send(account());
      await ensureMoneySeed(prisma);
      expect((await call('get', '/api/money/accounts')).body).toHaveLength(1);
      expect((await call('get', '/api/money/categories')).body).toHaveLength(0);
    });
  });

  describe('accounts', () => {
    it('creates an account whose balance starts at its opening balance', async () => {
      const res = await call('post', '/api/money/accounts').send(account());
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Savings',
        openingBalance: 500000,
        openingDate: '2026-11-01',
        archived: false,
        balance: 500000,
      });
    });

    it('lists accounts in their saved order, new ones last', async () => {
      await call('post', '/api/money/accounts').send(account({ name: 'A' }));
      await call('post', '/api/money/accounts').send(account({ name: 'B' }));
      await call('post', '/api/money/accounts').send(account({ name: 'C' }));
      const list = (await call('get', '/api/money/accounts')).body;
      expect(list.map((a: { name: string }) => a.name)).toEqual(['A', 'B', 'C']);

      const ids = [list[2].id, list[0].id, list[1].id];
      expect((await call('post', '/api/money/accounts/reorder').send({ ids })).status).toBe(204);
      const after = (await call('get', '/api/money/accounts')).body;
      expect(after.map((a: { name: string }) => a.name)).toEqual(['C', 'A', 'B']);
    });

    it('renames an account and changes its opening balance', async () => {
      const { id } = (await call('post', '/api/money/accounts').send(account())).body;
      const res = await call('patch', `/api/money/accounts/${id}`).send({ name: 'Bank', openingBalance: 100 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Bank', openingBalance: 100, balance: 100 });
    });

    it('archives and restores an account', async () => {
      const { id } = (await call('post', '/api/money/accounts').send(account())).body;
      expect((await call('patch', `/api/money/accounts/${id}`).send({ archived: true })).body.archived).toBe(true);
      expect((await call('get', '/api/money/accounts')).body).toHaveLength(0);
      expect((await call('get', '/api/money/accounts?includeArchived=1')).body).toHaveLength(1);
      await call('patch', `/api/money/accounts/${id}`).send({ archived: false });
      expect((await call('get', '/api/money/accounts')).body).toHaveLength(1);
    });

    it.each([
      [{ name: '' }, 'name'],
      [{ name: '   ' }, 'name'],
      [{ openingBalance: 12.5 }, 'openingBalance'],
      [{ openingBalance: 'lots' }, 'openingBalance'],
      [{ openingDate: '13/11/2026' }, 'openingDate'],
      [{ openingDate: '2026-02-30' }, 'openingDate'],
    ])('rejects %j', async (over, path) => {
      const res = await call('post', '/api/money/accounts').send(account(over));
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { path: string }) => e.path)).toContain(path);
    });

    it('allows a negative opening balance, for an overdrawn account', async () => {
      const res = await call('post', '/api/money/accounts').send(account({ openingBalance: -2500 }));
      expect(res.status).toBe(201);
      expect(res.body.balance).toBe(-2500);
    });

    it('answers 404 for an account that does not exist', async () => {
      expect((await call('patch', '/api/money/accounts/nope').send({ name: 'X' })).status).toBe(404);
    });

    it('rejects a reorder that does not list every account exactly once', async () => {
      const a = (await call('post', '/api/money/accounts').send(account({ name: 'A' }))).body;
      await call('post', '/api/money/accounts').send(account({ name: 'B' }));
      expect((await call('post', '/api/money/accounts/reorder').send({ ids: [a.id] })).status).toBe(400);
      expect((await call('post', '/api/money/accounts/reorder').send({ ids: [a.id, a.id] })).status).toBe(400);
    });
  });

  describe('categories', () => {
    const category = (over: object = {}) => ({ name: 'Snacks', color: 'coral', icon: 'coffee', ...over });

    it('creates, edits, reorders and archives', async () => {
      const a = (await call('post', '/api/money/categories').send(category({ name: 'A' }))).body;
      const b = (await call('post', '/api/money/categories').send(category({ name: 'B' }))).body;
      expect(a).toMatchObject({ name: 'A', color: 'coral', icon: 'coffee', archived: false, isFees: false });

      const edited = await call('patch', `/api/money/categories/${a.id}`).send({ name: 'Tea', color: 'mint' });
      expect(edited.body).toMatchObject({ name: 'Tea', color: 'mint' });

      await call('post', '/api/money/categories/reorder').send({ ids: [b.id, a.id] });
      expect((await call('get', '/api/money/categories')).body.map((c: { name: string }) => c.name)).toEqual(['B', 'Tea']);

      await call('patch', `/api/money/categories/${b.id}`).send({ archived: true });
      expect((await call('get', '/api/money/categories')).body.map((c: { name: string }) => c.name)).toEqual(['Tea']);
      expect((await call('get', '/api/money/categories?includeArchived=1')).body).toHaveLength(2);
    });

    it('rejects an unknown colour or icon', async () => {
      expect((await call('post', '/api/money/categories').send(category({ color: 'neon' }))).status).toBe(400);
      expect((await call('post', '/api/money/categories').send(category({ icon: 'rocket' }))).status).toBe(400);
    });

    it('merges one category into another and archives the source', async () => {
      await ensureMoneySeed(prisma);
      const categories = (await call('get', '/api/money/categories')).body;
      const food = categories.find((c: { name: string }) => c.name === 'Food');
      const other = categories.find((c: { name: string }) => c.name === 'Other');
      const cash = (await call('get', '/api/money/accounts')).body.find((a: { name: string }) => a.name === 'Cash');
      await prisma.moneyEntry.create({
        data: {
          kind: 'expense',
          date: new Date('2026-11-13'),
          amount: 500,
          name: 'Misc',
          accountId: cash.id,
          accountDelta: -500,
          categoryId: other.id,
        },
      });
      await prisma.moneyShortcut.create({
        data: { name: 'Misc', amount: 500, accountId: cash.id, categoryId: other.id },
      });
      await prisma.moneyBudget.create({ data: { categoryId: other.id, amount: 9000 } });

      const res = await call('post', `/api/money/categories/${other.id}/merge`).send({ intoId: food.id });

      expect(res.status).toBe(204);
      expect((await prisma.moneyEntry.findFirstOrThrow()).categoryId).toBe(food.id);
      expect((await prisma.moneyShortcut.findFirstOrThrow()).categoryId).toBe(food.id);
      expect((await prisma.moneyBudget.findFirstOrThrow()).categoryId).toBe(food.id);
      const after = (await call('get', '/api/money/categories?includeArchived=1')).body;
      expect(after.find((c: { id: string }) => c.id === other.id).archived).toBe(true);
    });

    it('keeps the target budget when both categories have one', async () => {
      const a = (await call('post', '/api/money/categories').send(category({ name: 'A' }))).body;
      const b = (await call('post', '/api/money/categories').send(category({ name: 'B' }))).body;
      await prisma.moneyBudget.createMany({
        data: [
          { categoryId: a.id, amount: 1000 },
          { categoryId: b.id, amount: 7000 },
        ],
      });
      await call('post', `/api/money/categories/${a.id}/merge`).send({ intoId: b.id });
      const budgets = await prisma.moneyBudget.findMany();
      expect(budgets).toHaveLength(1);
      expect(budgets[0]).toMatchObject({ categoryId: b.id, amount: 7000 });
    });

    it('refuses to merge a category into itself or into one that does not exist', async () => {
      const a = (await call('post', '/api/money/categories').send(category())).body;
      expect((await call('post', `/api/money/categories/${a.id}/merge`).send({ intoId: a.id })).status).toBe(400);
      expect((await call('post', `/api/money/categories/${a.id}/merge`).send({ intoId: 'nope' })).status).toBe(404);
    });

    it('keeps the Fees category: it cannot be archived or merged away', async () => {
      await ensureMoneySeed(prisma);
      const categories = (await call('get', '/api/money/categories')).body;
      const fees = categories.find((c: { isFees: boolean }) => c.isFees);
      const food = categories.find((c: { name: string }) => c.name === 'Food');

      const archive = await call('patch', `/api/money/categories/${fees.id}`).send({ archived: true });
      expect(archive.status).toBe(400);
      expect(archive.body.message).toBe('The Fees category is used for transfer fees and cannot be removed');
      expect((await call('post', `/api/money/categories/${fees.id}/merge`).send({ intoId: food.id })).status).toBe(400);
      // It can still be renamed and recoloured.
      expect((await call('patch', `/api/money/categories/${fees.id}`).send({ name: 'Charges' })).status).toBe(200);
    });
  });

  it('needs a session everywhere', async () => {
    expect((await http().get('/api/money/accounts')).status).toBe(401);
    expect((await http().post('/api/money/accounts').send(account())).status).toBe(401);
    expect((await http().get('/api/money/categories')).status).toBe(401);
    expect((await http().post('/api/money/categories/x/merge').send({ intoId: 'y' })).status).toBe(401);
  });
});
