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

describe('money entries', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let bank: string;
  let bkash: string;
  let cash: string;
  let food: string;
  let travel: string;
  let fees: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'delete', url: string) => http()[method](url).set('Cookie', cookie);
  const add = (body: object) => call('post', '/api/money/entries').send(body);
  const balances = async (): Promise<Record<string, number>> => {
    const list = (await call('get', '/api/money/accounts?includeArchived=1')).body as (Named & { balance: number })[];
    return Object.fromEntries(list.map((a) => [a.name, a.balance]));
  };
  const expense = (over: object = {}) => ({
    kind: 'expense',
    date: '2026-11-10',
    amount: 8000,
    name: 'Office rickshaw, both ways',
    accountId: cash,
    categoryId: travel,
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    await ensureMoneySeed(prisma);
    const accounts = (await call('get', '/api/money/accounts')).body as Named[];
    const categories = (await call('get', '/api/money/categories')).body as Named[];
    const id = (list: Named[], name: string) => list.find((item) => item.name === name)!.id;
    [bank, bkash, cash] = [id(accounts, 'Bank'), id(accounts, 'bKash'), id(accounts, 'Cash')];
    [food, travel, fees] = [id(categories, 'Food'), id(categories, 'Travel'), id(categories, 'Fees')];
    // Opening balances: Bank 50,000.00, bKash 3,000.00, Cash 1,000.00
    await call('patch', `/api/money/accounts/${bank}`).send({ openingBalance: 5_000_000 });
    await call('patch', `/api/money/accounts/${bkash}`).send({ openingBalance: 300_000 });
    await call('patch', `/api/money/accounts/${cash}`).send({ openingBalance: 100_000 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating', () => {
    it('an expense lowers its account', async () => {
      const res = await add(expense());
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        kind: 'expense',
        date: '2026-11-10',
        amount: 8000,
        name: 'Office rickshaw, both ways',
        accountId: cash,
        categoryId: travel,
        toAccountId: null,
        fee: null,
      });
      expect(await balances()).toEqual({ Bank: 5_000_000, bKash: 300_000, Cash: 92_000 });
    });

    it('income raises its account', async () => {
      const res = await add({ kind: 'income', date: '2026-11-05', amount: 4_000_000, name: 'Salary', accountId: bank });
      expect(res.status).toBe(201);
      expect((await balances()).Bank).toBe(9_000_000);
    });

    it('a transfer moves money between two accounts and names itself', async () => {
      const res = await add({ kind: 'transfer', date: '2026-11-06', amount: 200_000, accountId: bank, toAccountId: cash });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Bank to Cash');
      expect(await balances()).toEqual({ Bank: 4_800_000, bKash: 300_000, Cash: 300_000 });
    });

    it('a transfer with a fee records the fee as its own expense', async () => {
      const res = await add({
        kind: 'transfer',
        date: '2026-11-06',
        amount: 100_000,
        accountId: bkash,
        toAccountId: cash,
        fee: 1850,
      });
      expect(res.status).toBe(201);
      expect(res.body.fee).toMatchObject({ amount: 1850 });
      expect(await balances()).toEqual({ Bank: 5_000_000, bKash: 300_000 - 100_000 - 1850, Cash: 200_000 });

      const day = (await call('get', '/api/money/entries?date=2026-11-06')).body;
      const fee = day.find((entry: { feeOfId: string | null }) => entry.feeOfId);
      expect(fee).toMatchObject({
        kind: 'expense',
        name: 'Fee: bKash to Cash',
        amount: 1850,
        accountId: bkash,
        categoryId: fees,
        feeOfId: res.body.id,
      });
    });

    it('a correction sets the balance to the true figure', async () => {
      await add(expense());
      const res = await add({ kind: 'correction', date: '2026-11-11', accountId: cash, trueBalance: 90_000 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'correction', amount: 2000, name: 'Balance correction' });
      expect((await balances()).Cash).toBe(90_000);
    });

    it('a correction upward works too', async () => {
      await add({ kind: 'correction', accountId: cash, trueBalance: 125_000 });
      expect((await balances()).Cash).toBe(125_000);
    });

    it('refuses a correction to the balance the account already has', async () => {
      const res = await add({ kind: 'correction', accountId: cash, trueBalance: 100_000 });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toEqual({ path: 'trueBalance', message: 'That is already the balance' });
    });

    it('uses today in the owner’s time zone when no date is given', async () => {
      const res = await add(expense({ date: undefined }));
      expect(res.body.date).toBe(todayIn('Asia/Dhaka'));
    });

    it('saves a note', async () => {
      expect((await add(expense({ note: '  shared with Karim ' }))).body.note).toBe('shared with Karim');
    });
  });

  describe('refusing bad input, saving nothing', () => {
    it.each([
      [{ amount: 0 }, 'amount'],
      [{ amount: -500 }, 'amount'],
      [{ amount: 12.5 }, 'amount'],
      [{ amount: 2_000_000_001 }, 'amount'],
      [{ amount: '80' }, 'amount'],
      [{ name: ' ' }, 'name'],
      [{ date: '2999-01-01' }, 'date'],
      [{ date: '10/11/2026' }, 'date'],
      [{ accountId: 'nope' }, 'accountId'],
      [{ categoryId: 'nope' }, 'categoryId'],
      [{ categoryId: undefined }, 'categoryId'],
    ])('an expense with %j', async (over, path) => {
      const res = await add(expense(over));
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { path: string }) => e.path)).toContain(path);
      expect(await prisma.moneyEntry.count()).toBe(0);
    });

    it('a future date says so plainly', async () => {
      const res = await add(expense({ date: '2999-01-01' }));
      expect(res.body.errors[0].message).toBe('Pick today or an earlier date');
    });

    it('an archived account or category', async () => {
      await call('patch', `/api/money/accounts/${cash}`).send({ archived: true });
      expect((await add(expense())).body.errors[0].path).toBe('accountId');
      await call('patch', `/api/money/categories/${travel}`).send({ archived: true });
      expect((await add(expense({ accountId: bank }))).body.errors[0].path).toBe('categoryId');
    });

    it('a transfer to the same account', async () => {
      const res = await add({ kind: 'transfer', amount: 100, accountId: cash, toAccountId: cash });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toEqual({ path: 'toAccountId', message: 'Pick a different account to move money to' });
    });

    it('a transfer with a bad fee saves neither the transfer nor the fee', async () => {
      const res = await add({ kind: 'transfer', amount: 100, accountId: bkash, toAccountId: cash, fee: -5 });
      expect(res.status).toBe(400);
      expect(await prisma.moneyEntry.count()).toBe(0);
    });

    it('an unknown kind', async () => {
      expect((await add({ kind: 'gift', amount: 100, accountId: cash })).status).toBe(400);
    });
  });

  describe('editing', () => {
    it('changing the amount moves the balance by the difference', async () => {
      const { id } = (await add(expense())).body;
      const res = await call('patch', `/api/money/entries/${id}`).send({ amount: 6000 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(6000);
      expect((await balances()).Cash).toBe(94_000);
    });

    it('changing the account moves the spending to the other account', async () => {
      const { id } = (await add(expense())).body;
      await call('patch', `/api/money/entries/${id}`).send({ accountId: bkash });
      expect(await balances()).toEqual({ Bank: 5_000_000, bKash: 292_000, Cash: 100_000 });
    });

    it('changing the date, name, category and note', async () => {
      const { id } = (await add(expense())).body;
      const res = await call('patch', `/api/money/entries/${id}`).send({
        date: '2026-11-09',
        name: 'Rickshaw',
        categoryId: food,
        note: 'rain',
      });
      expect(res.body).toMatchObject({ date: '2026-11-09', name: 'Rickshaw', categoryId: food, note: 'rain' });
      expect((await call('get', '/api/money/entries?date=2026-11-10')).body).toHaveLength(0);
    });

    it('an old entry on a since-archived account can still be edited', async () => {
      const { id } = (await add(expense())).body;
      await call('patch', `/api/money/accounts/${cash}`).send({ archived: true });
      expect((await call('patch', `/api/money/entries/${id}`).send({ amount: 7000 })).status).toBe(200);
      expect((await balances()).Cash).toBe(93_000);
    });

    it('editing a transfer changes both sides', async () => {
      const { id } = (await add({ kind: 'transfer', date: '2026-11-06', amount: 200_000, accountId: bank, toAccountId: cash })).body;
      const res = await call('patch', `/api/money/entries/${id}`).send({ amount: 150_000, toAccountId: bkash });
      expect(res.body.name).toBe('Bank to bKash');
      expect(await balances()).toEqual({ Bank: 4_850_000, bKash: 450_000, Cash: 100_000 });
    });

    it('a transfer’s fee can be added, changed and removed', async () => {
      const { id } = (await add({ kind: 'transfer', date: '2026-11-06', amount: 100_000, accountId: bkash, toAccountId: cash })).body;

      expect((await call('patch', `/api/money/entries/${id}`).send({ fee: 1850 })).body.fee.amount).toBe(1850);
      expect((await balances()).bKash).toBe(300_000 - 100_000 - 1850);

      await call('patch', `/api/money/entries/${id}`).send({ fee: 1000 });
      expect((await balances()).bKash).toBe(300_000 - 100_000 - 1000);
      expect(await prisma.moneyEntry.count()).toBe(2);

      expect((await call('patch', `/api/money/entries/${id}`).send({ fee: 0 })).body.fee).toBeNull();
      expect((await balances()).bKash).toBe(200_000);
      expect(await prisma.moneyEntry.count()).toBe(1);
    });

    it('a fee follows its transfer when the date or account changes', async () => {
      const { id } = (await add({ kind: 'transfer', date: '2026-11-06', amount: 100_000, accountId: bkash, toAccountId: cash, fee: 1850 })).body;
      await call('patch', `/api/money/entries/${id}`).send({ date: '2026-11-07', accountId: bank });
      const fee = await prisma.moneyEntry.findFirstOrThrow({ where: { feeOfId: id } });
      expect(fee.date.toISOString().slice(0, 10)).toBe('2026-11-07');
      expect(fee.accountId).toBe(bank);
      expect(fee.name).toBe('Fee: Bank to Cash');
      expect(await balances()).toEqual({ Bank: 5_000_000 - 100_000 - 1850, bKash: 300_000, Cash: 200_000 });
    });

    it('a fee is edited through its transfer, not directly', async () => {
      const transfer = (await add({ kind: 'transfer', amount: 100_000, accountId: bkash, toAccountId: cash, fee: 1850 })).body;
      const res = await call('patch', `/api/money/entries/${transfer.fee.id}`).send({ amount: 5 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Edit the transfer to change its fee');
    });

    it('a correction keeps its amount; an older entry edited later still shifts the balance', async () => {
      const older = (await add(expense())).body;
      const correction = (await add({ kind: 'correction', date: '2026-11-11', accountId: cash, trueBalance: 90_000 })).body;

      expect((await call('patch', `/api/money/entries/${correction.id}`).send({ trueBalance: 1 })).status).toBe(400);
      expect((await call('patch', `/api/money/entries/${correction.id}`).send({ note: 'counted the wallet' })).status).toBe(200);

      await call('patch', `/api/money/entries/${older.id}`).send({ amount: 7000 });
      expect((await balances()).Cash).toBe(91_000);
    });

    it('the kind cannot be changed', async () => {
      const { id } = (await add(expense())).body;
      expect((await call('patch', `/api/money/entries/${id}`).send({ kind: 'income' })).status).toBe(400);
    });

    it('rejects a bad edit and leaves the entry as it was', async () => {
      const { id } = (await add(expense())).body;
      expect((await call('patch', `/api/money/entries/${id}`).send({ amount: 0 })).status).toBe(400);
      expect((await balances()).Cash).toBe(92_000);
    });

    it('answers 404 for an entry that does not exist', async () => {
      expect((await call('patch', '/api/money/entries/nope').send({ amount: 5 })).status).toBe(404);
      expect((await call('delete', '/api/money/entries/nope')).status).toBe(404);
    });
  });

  describe('deleting', () => {
    it('restores the balance', async () => {
      const { id } = (await add(expense())).body;
      expect((await call('delete', `/api/money/entries/${id}`)).status).toBe(204);
      expect((await balances()).Cash).toBe(100_000);
    });

    it('a transfer takes its fee with it', async () => {
      const { id } = (await add({ kind: 'transfer', amount: 100_000, accountId: bkash, toAccountId: cash, fee: 1850 })).body;
      await call('delete', `/api/money/entries/${id}`);
      expect(await prisma.moneyEntry.count()).toBe(0);
      expect(await balances()).toEqual({ Bank: 5_000_000, bKash: 300_000, Cash: 100_000 });
    });

    it('a fee can be deleted on its own', async () => {
      const transfer = (await add({ kind: 'transfer', amount: 100_000, accountId: bkash, toAccountId: cash, fee: 1850 })).body;
      expect((await call('delete', `/api/money/entries/${transfer.fee.id}`)).status).toBe(204);
      expect((await balances()).bKash).toBe(200_000);
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      await add(expense({ date: '2026-11-10', name: 'Rickshaw', amount: 8000 }));
      await add(expense({ date: '2026-11-10', name: 'Lunch', amount: 15_000, accountId: bkash, categoryId: food, note: 'Canteen' }));
      await add(expense({ date: '2026-11-12', name: 'Lunch', amount: 14_000, accountId: cash, categoryId: food }));
      await add({ kind: 'income', date: '2026-11-05', amount: 4_000_000, name: 'Salary', accountId: bank });
    });

    it('one day, newest first', async () => {
      const day = (await call('get', '/api/money/entries?date=2026-11-10')).body;
      expect(day.map((entry: Named) => entry.name)).toEqual(['Lunch', 'Rickshaw']);
    });

    it('a range, newest date first', async () => {
      const range = (await call('get', '/api/money/entries?from=2026-11-06&to=2026-11-12')).body;
      expect(range.map((entry: { date: string }) => entry.date)).toEqual(['2026-11-12', '2026-11-10', '2026-11-10']);
    });

    it('filters by account, category and text', async () => {
      const q = (query: string) => call('get', `/api/money/entries?from=2026-11-01&to=2026-11-30&${query}`);
      expect((await q(`accountId=${bkash}`)).body).toHaveLength(1);
      expect((await q(`categoryId=${food}`)).body).toHaveLength(2);
      expect((await q('q=lun')).body).toHaveLength(2);
      expect((await q('q=CANTEEN')).body).toHaveLength(1);
      expect((await q(`accountId=${bank}`)).body[0].name).toBe('Salary');
    });

    it('finds a transfer by either of its accounts', async () => {
      await add({ kind: 'transfer', date: '2026-11-11', amount: 100, accountId: bank, toAccountId: cash });
      const res = await call('get', `/api/money/entries?date=2026-11-11&accountId=${cash}`);
      expect(res.body).toHaveLength(1);
    });

    it('needs a date or a range, and honours limit', async () => {
      expect((await call('get', '/api/money/entries')).status).toBe(400);
      expect((await call('get', '/api/money/entries?date=nope')).status).toBe(400);
      expect((await call('get', '/api/money/entries?from=2026-11-01&to=2026-11-30&limit=2')).body).toHaveLength(2);
    });

    it('suggests names with the values last used for each', async () => {
      const names = (await call('get', '/api/money/entries/names?q=lu')).body;
      expect(names).toEqual([{ name: 'Lunch', accountId: cash, categoryId: food, amount: 14_000 }]);
      const all = (await call('get', '/api/money/entries/names')).body;
      expect(all.map((n: Named) => n.name)).toEqual(['Lunch', 'Rickshaw']);
    });
  });

  it('needs a session everywhere', async () => {
    expect((await http().get('/api/money/entries?date=2026-11-10')).status).toBe(401);
    expect((await http().post('/api/money/entries').send({})).status).toBe(401);
    expect((await http().patch('/api/money/entries/x').send({})).status).toBe(401);
    expect((await http().delete('/api/money/entries/x')).status).toBe(401);
    expect((await http().get('/api/money/entries/names')).status).toBe(401);
  });
});

describe('text the database must be able to store', () => {
  it('keeps Bangla text and the taka sign in an entry name and note', async () => {
    const app = await createTestApp();
    try {
      const cookie = await loginAsOwner(app);
      await ensureMoneySeed(app.get(PrismaService));
      const call = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Cookie', cookie);
      const cash = (await call('get', '/api/money/accounts')).body.find((a: Named) => a.name === 'Cash').id;
      const food = (await call('get', '/api/money/categories')).body.find((c: Named) => c.name === 'Food').id;
      const res = await call('post', '/api/money/entries').send({
        kind: 'expense',
        date: '2026-11-10',
        amount: 5000,
        name: 'দুপুরের খাবার',
        note: '৳50 ক্যান্টিন',
        accountId: cash,
        categoryId: food,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'দুপুরের খাবার', note: '৳50 ক্যান্টিন' });
    } finally {
      await app.close();
    }
  });
});
