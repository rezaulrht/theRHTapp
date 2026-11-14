import type { INestApplication } from '@nestjs/common';
import { todayIn } from '@pa/shared';
import request from 'supertest';
import { ensureMoneySeed } from '../src/money/seed';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

interface Named {
  id: string;
  name: string;
}

describe('money shortcuts, budgets and loans', () => {
  let app: INestApplication;
  let cookie: string;
  let bank: string;
  let cash: string;
  let food: string;
  let travel: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) =>
    http()[method](url).set('Cookie', cookie);
  const balanceOf = async (id: string): Promise<number> =>
    (await call('get', '/api/money/accounts?includeArchived=1')).body.find((a: Named) => a.id === id).balance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    await ensureMoneySeed(app.get(PrismaService));
    const accounts = (await call('get', '/api/money/accounts')).body as Named[];
    const categories = (await call('get', '/api/money/categories')).body as Named[];
    bank = accounts.find((a) => a.name === 'Bank')!.id;
    cash = accounts.find((a) => a.name === 'Cash')!.id;
    food = categories.find((c) => c.name === 'Food')!.id;
    travel = categories.find((c) => c.name === 'Travel')!.id;
    await call('patch', `/api/money/accounts/${cash}`).send({ openingBalance: 100_000 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('shortcuts', () => {
    const shortcut = (over: object = {}) => ({
      name: 'Office rickshaw',
      amount: 8000,
      accountId: cash,
      categoryId: travel,
      ...over,
    });

    it('creates, edits, reorders and deletes', async () => {
      const a = (await call('post', '/api/money/shortcuts').send(shortcut())).body;
      const b = (await call('post', '/api/money/shortcuts').send(shortcut({ name: 'Lunch', amount: 15_000, categoryId: food }))).body;
      expect(a).toMatchObject({ name: 'Office rickshaw', amount: 8000, accountId: cash, categoryId: travel, usable: true });

      expect((await call('patch', `/api/money/shortcuts/${a.id}`).send({ amount: 9000 })).body.amount).toBe(9000);
      expect((await call('post', '/api/money/shortcuts/reorder').send({ ids: [b.id, a.id] })).status).toBe(204);
      expect((await call('get', '/api/money/shortcuts')).body.map((s: Named) => s.name)).toEqual(['Lunch', 'Office rickshaw']);

      expect((await call('delete', `/api/money/shortcuts/${a.id}`)).status).toBe(204);
      expect((await call('get', '/api/money/shortcuts')).body).toHaveLength(1);
    });

    it('using one records an expense today with its values', async () => {
      const { id } = (await call('post', '/api/money/shortcuts').send(shortcut())).body;
      const res = await call('post', `/api/money/shortcuts/${id}/use`).send({});
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        kind: 'expense',
        name: 'Office rickshaw',
        amount: 8000,
        accountId: cash,
        categoryId: travel,
        date: todayIn('Asia/Dhaka'),
      });
      expect(await balanceOf(cash)).toBe(92_000);
    });

    it('using one with a different amount and day', async () => {
      const { id } = (await call('post', '/api/money/shortcuts').send(shortcut())).body;
      const res = await call('post', `/api/money/shortcuts/${id}/use`).send({ amount: 10_000, date: '2026-11-10' });
      expect(res.body).toMatchObject({ amount: 10_000, date: '2026-11-10' });
    });

    it('becomes unusable when its account or category is archived', async () => {
      const { id } = (await call('post', '/api/money/shortcuts').send(shortcut())).body;
      await call('patch', `/api/money/categories/${travel}`).send({ archived: true });
      expect((await call('get', '/api/money/shortcuts')).body[0].usable).toBe(false);
      const res = await call('post', `/api/money/shortcuts/${id}/use`).send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("This shortcut's account or category is archived");
    });

    it('rejects bad input and unknown ids', async () => {
      expect((await call('post', '/api/money/shortcuts').send(shortcut({ amount: 0 }))).status).toBe(400);
      expect((await call('post', '/api/money/shortcuts').send(shortcut({ accountId: 'nope' }))).status).toBe(400);
      expect((await call('post', '/api/money/shortcuts/nope/use').send({})).status).toBe(404);
      expect((await call('delete', '/api/money/shortcuts/nope')).status).toBe(404);
    });
  });

  describe('budgets', () => {
    it('sets, changes, lists and clears budgets, including the whole-month one', async () => {
      expect((await call('put', '/api/money/budgets').send({ categoryId: food, amount: 600_000 })).status).toBe(204);
      await call('put', '/api/money/budgets').send({ categoryId: null, amount: 2_000_000 });
      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 500_000 });

      const list = (await call('get', '/api/money/budgets')).body;
      expect(list).toHaveLength(2);
      expect(list).toEqual(
        expect.arrayContaining([
          { categoryId: food, amount: 500_000 },
          { categoryId: null, amount: 2_000_000 },
        ]),
      );

      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 0 });
      await call('put', '/api/money/budgets').send({ categoryId: null, amount: 0 });
      expect((await call('get', '/api/money/budgets')).body).toEqual([]);
    });

    it('rejects a negative budget and an unknown category', async () => {
      expect((await call('put', '/api/money/budgets').send({ categoryId: food, amount: -1 })).status).toBe(400);
      expect((await call('put', '/api/money/budgets').send({ categoryId: 'nope', amount: 100 })).status).toBe(400);
    });
  });

  describe('people and loans', () => {
    const person = async (name = 'Rahim'): Promise<string> =>
      (await call('post', '/api/money/people').send({ name })).body.id;
    const loan = (personId: string, direction: string, amount: number, over: object = {}) =>
      call('post', '/api/money/loans').send({ personId, direction, amount, accountId: cash, date: '2026-11-10', ...over });
    const owed = async (id: string): Promise<number> =>
      (await call('get', '/api/money/people?includeArchived=1')).body.find((p: Named) => p.id === id).owed;

    it('lending lowers the account and raises what they owe; a repayment reverses part of it', async () => {
      const id = await person();
      const lent = await loan(id, 'lent', 50_000);
      expect(lent.status).toBe(201);
      expect(lent.body).toMatchObject({ kind: 'loan', name: 'Lent to Rahim', loanDirection: 'lent', personId: id });
      expect(await balanceOf(cash)).toBe(50_000);
      expect(await owed(id)).toBe(50_000);

      const repaid = await loan(id, 'repaid_to_me', 20_000);
      expect(repaid.body.name).toBe('Rahim repaid');
      expect(await balanceOf(cash)).toBe(70_000);
      expect(await owed(id)).toBe(30_000);
    });

    it('borrowing raises the account and the owner owes them', async () => {
      const id = await person('Karim');
      expect((await loan(id, 'borrowed', 120_000)).body.name).toBe('Borrowed from Karim');
      expect(await balanceOf(cash)).toBe(220_000);
      expect(await owed(id)).toBe(-120_000);
      expect((await loan(id, 'repaid_by_me', 120_000)).body.name).toBe('Repaid Karim');
      expect(await owed(id)).toBe(0);
    });

    it('loans are not spending or income', async () => {
      const id = await person();
      await loan(id, 'lent', 50_000);
      const day = (await call('get', '/api/money/entries?date=2026-11-10')).body;
      expect(day).toHaveLength(1);
      expect(day[0].kind).toBe('loan');
    });

    it('a loan can be edited and deleted through the entries routes', async () => {
      const id = await person();
      const entry = (await loan(id, 'lent', 50_000)).body;
      await call('patch', `/api/money/entries/${entry.id}`).send({ amount: 40_000, accountId: bank });
      expect(await owed(id)).toBe(40_000);
      expect(await balanceOf(cash)).toBe(100_000);
      expect(await balanceOf(bank)).toBe(-40_000);
      await call('delete', `/api/money/entries/${entry.id}`);
      expect(await owed(id)).toBe(0);
    });

    it('shows a person’s history, newest first', async () => {
      const id = await person();
      await loan(id, 'lent', 50_000, { date: '2026-11-08' });
      await loan(id, 'repaid_to_me', 20_000, { date: '2026-11-10' });
      const history = (await call('get', `/api/money/people/${id}/history`)).body;
      expect(history.map((h: Named) => h.name)).toEqual(['Rahim repaid', 'Lent to Rahim']);
    });

    it('renames a person; archiving waits until they are settled', async () => {
      const id = await person();
      expect((await call('patch', `/api/money/people/${id}`).send({ name: 'Rahim Uddin' })).body.name).toBe('Rahim Uddin');
      await loan(id, 'lent', 500);

      const blocked = await call('patch', `/api/money/people/${id}`).send({ archived: true });
      expect(blocked.status).toBe(400);
      expect(blocked.body.message).toBe('Settle up before archiving');

      await loan(id, 'repaid_to_me', 500);
      expect((await call('patch', `/api/money/people/${id}`).send({ archived: true })).body.archived).toBe(true);
      expect((await call('get', '/api/money/people')).body).toHaveLength(0);
    });

    it('rejects bad loans', async () => {
      const id = await person();
      expect((await loan(id, 'gifted', 500)).status).toBe(400);
      expect((await loan(id, 'lent', 0)).status).toBe(400);
      expect((await loan('nope', 'lent', 500)).status).toBe(400);
      expect((await loan(id, 'lent', 500, { accountId: 'nope' })).status).toBe(400);
      expect((await loan(id, 'lent', 500, { date: '2999-01-01' })).status).toBe(400);
      expect((await call('post', '/api/money/people').send({ name: ' ' })).status).toBe(400);
    });
  });

  it('needs a session everywhere', async () => {
    for (const url of ['/api/money/shortcuts', '/api/money/budgets', '/api/money/people']) {
      expect((await http().get(url)).status).toBe(401);
    }
    expect((await http().post('/api/money/loans').send({})).status).toBe(401);
  });
});
