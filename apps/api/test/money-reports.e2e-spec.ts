import type { INestApplication } from '@nestjs/common';
import { todayIn } from '@pa/shared';
import request from 'supertest';
import { MoneyRemindersService } from '../src/money/money-reminders.service';
import { ensureMoneySeed } from '../src/money/seed';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReminderEngineService } from '../src/reminders/reminder-engine.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

interface Named {
  id: string;
  name: string;
}

describe('money reports, reminders and export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminders: MoneyRemindersService;
  let cookie: string;
  let bank: string;
  let cash: string;
  let food: string;
  let travel: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) =>
    http()[method](url).set('Cookie', cookie);
  const spend = (date: string | undefined, amount: number, categoryId: string, name = 'Thing') =>
    call('post', '/api/money/entries').send({ kind: 'expense', date, amount, name, accountId: cash, categoryId });
  const month = async (m: string) => (await call('get', `/api/money/reports/month?month=${m}`)).body;
  const moneyReminders = () => prisma.reminder.findMany({ where: { ownerType: 'money' }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    reminders = app.get(MoneyRemindersService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    await ensureMoneySeed(prisma);
    const accounts = (await call('get', '/api/money/accounts')).body as Named[];
    const categories = (await call('get', '/api/money/categories')).body as Named[];
    bank = accounts.find((a) => a.name === 'Bank')!.id;
    cash = accounts.find((a) => a.name === 'Cash')!.id;
    food = categories.find((c) => c.name === 'Food')!.id;
    travel = categories.find((c) => c.name === 'Travel')!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('month report', () => {
    beforeEach(async () => {
      // September: 100.00 food. October: 150.00 food, 80.00 travel, salary.
      await spend('2026-09-10', 10_000, food);
      await spend('2026-10-01', 9_000, food); // Thursday
      await spend('2026-10-02', 6_000, food); // Friday
      await spend('2026-10-02', 8_000, travel);
      await call('post', '/api/money/entries').send({
        kind: 'income',
        date: '2026-10-05',
        amount: 4_000_000,
        name: 'Salary',
        accountId: bank,
      });
    });

    it('totals the month and compares it with the one before', async () => {
      const report = await month('2026-10');
      expect(report.month).toBe('2026-10');
      expect(report.spent).toEqual({ current: 23_000, previous: 10_000, change: 13_000, percent: 130 });
      expect(report.income).toEqual({ current: 4_000_000, previous: 0, change: 4_000_000, percent: null });
      expect(report.hasEarlierMonth).toBe(true);
    });

    it('breaks spending down by category, largest first, with last month alongside', async () => {
      const { byCategory } = await month('2026-10');
      expect(byCategory.map((c: Named & { spent: number; previous: number }) => [c.name, c.spent, c.previous])).toEqual([
        ['Food', 15_000, 10_000],
        ['Travel', 8_000, 0],
      ]);
      expect(byCategory[0]).toMatchObject({ categoryId: food, color: 'coral', icon: 'food', archived: false });
      expect(byCategory[0].share).toBeCloseTo(15_000 / 23_000);
    });

    it('has nothing to compare in the first month ever', async () => {
      const report = await month('2026-09');
      expect(report.hasEarlierMonth).toBe(false);
      expect(report.spent).toEqual({ current: 10_000, previous: null, change: null, percent: null });
      expect(report.byCategory[0].previous).toBeNull();
    });

    it('is all zeros for a month with no entries', async () => {
      const report = await month('2026-08');
      expect(report.spent.current).toBe(0);
      expect(report.income.current).toBe(0);
      expect(report.byCategory).toEqual([]);
      expect(report.byDayType).toEqual([]);
      expect(report.overall).toEqual({ budget: null, state: null });
    });

    it('shows each budget and where spending stands against it', async () => {
      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 18_750 }); // 15,000 is exactly 80%
      await call('put', '/api/money/budgets').send({ categoryId: travel, amount: 7_999 });
      await call('put', '/api/money/budgets').send({ categoryId: null, amount: 100_000 });
      const report = await month('2026-10');
      const byName = Object.fromEntries(report.byCategory.map((c: Named & { budget: number; state: string }) => [c.name, c]));
      expect(byName.Food).toMatchObject({ budget: 18_750, state: 'warning' });
      expect(byName.Travel).toMatchObject({ budget: 7_999, state: 'over' });
      expect(report.overall).toEqual({ budget: 100_000, state: 'ok' });
    });

    it('lists a budgeted category even when nothing was spent in it', async () => {
      const study = (await call('get', '/api/money/categories')).body.find((c: Named) => c.name === 'Study').id;
      await call('put', '/api/money/budgets').send({ categoryId: study, amount: 50_000 });
      const report = await month('2026-10');
      expect(report.byCategory.find((c: Named) => c.name === 'Study')).toMatchObject({ spent: 0, budget: 50_000, state: 'ok' });
    });

    it('keeps an archived category’s name on its past spending', async () => {
      await call('patch', `/api/money/categories/${travel}`).send({ archived: true });
      const report = await month('2026-10');
      expect(report.byCategory.find((c: Named) => c.name === 'Travel')).toMatchObject({ archived: true, spent: 8_000 });
    });

    it('splits spending by kind of day, following the week pattern in settings', async () => {
      const before = await month('2026-10');
      expect(before.byDayType).toEqual([
        { dayTypeId: 'classday', name: 'Class day', total: 14_000, days: 1, average: 14_000 },
        { dayTypeId: 'workday', name: 'Workday', total: 9_000, days: 1, average: 9_000 },
      ]);

      const settings = (await call('get', '/api/settings')).body;
      await call('patch', '/api/settings').send({
        'general.weekPattern': { ...settings['general.weekPattern'], thu: 'classday' },
      });
      const after = await month('2026-10');
      expect(after.byDayType).toEqual([
        { dayTypeId: 'classday', name: 'Class day', total: 23_000, days: 2, average: 11_500 },
      ]);
    });

    it('defaults to the current month and rejects a malformed one', async () => {
      const res = await call('get', '/api/money/reports/month');
      expect(res.body.month).toBe(todayIn('Asia/Dhaka').slice(0, 7));
      expect((await call('get', '/api/money/reports/month?month=October')).status).toBe(400);
    });
  });

  describe('day and today reports', () => {
    it('totals one day', async () => {
      await spend('2026-10-02', 6_000, food, 'Lunch');
      await spend('2026-10-02', 8_000, travel, 'Bus');
      await call('post', '/api/money/entries').send({ kind: 'income', date: '2026-10-02', amount: 500, name: 'Refund', accountId: cash });
      const res = await call('get', '/api/money/reports/day?date=2026-10-02');
      expect(res.body).toMatchObject({ date: '2026-10-02', spent: 14_000, income: 500 });
      expect(res.body.entries).toHaveLength(3);
    });

    it('today shows spending, balances, and last week’s same weekday', async () => {
      const today = todayIn('Asia/Dhaka');
      const lastWeek = new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      await spend(lastWeek, 30_000, food);
      await spend(undefined, 23_500, food);

      const res = await call('get', '/api/money/reports/today');
      expect(res.body.date).toBe(today);
      expect(res.body.spent).toBe(23_500);
      expect(res.body.comparedToSameWeekdayLastWeek).toEqual({ current: 23_500, previous: 30_000, change: -6_500, percent: -22 });
      expect(res.body.balances.map((b: Named) => b.name)).toEqual(['Bank', 'bKash', 'Cash']);
      expect(res.body.balances[2].balance).toBe(-53_500);
    });

    it('today has nothing to compare before any history exists', async () => {
      const res = await call('get', '/api/money/reports/today');
      expect(res.body.spent).toBe(0);
      expect(res.body.comparedToSameWeekdayLastWeek.previous).toBeNull();
    });
  });

  describe('daily reminder', () => {
    it('is created from the setting, follows changes to it, and goes when switched off', async () => {
      await reminders.syncDailyReminder();
      let [reminder] = await moneyReminders();
      expect(reminder).toMatchObject({
        ownerId: 'daily-log',
        title: "Log today's spending",
        url: '/money',
        channels: ['push'],
        enabled: true,
      });
      expect(reminder!.schedule).toEqual({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '21:00' });

      // Changing the setting through the API updates the same reminder.
      await call('patch', '/api/settings').send({
        'money.dailyReminder': { enabled: true, time: '22:15', channels: ['push', 'email'], skipIfLogged: true },
      });
      const afterChange = await moneyReminders();
      expect(afterChange).toHaveLength(1);
      expect(afterChange[0]!.id).toBe(reminder!.id);
      expect(afterChange[0]!.schedule).toMatchObject({ time: '22:15' });
      expect(afterChange[0]!.channels).toEqual(['push', 'email']);

      await call('patch', '/api/settings').send({
        'money.dailyReminder': { enabled: false, time: '22:15', channels: ['push'], skipIfLogged: true },
      });
      expect(await moneyReminders()).toHaveLength(0);

      [reminder] = await moneyReminders();
      expect(reminder).toBeUndefined();
    });

    it('is left alone by unrelated settings changes', async () => {
      await call('patch', '/api/settings').send({ 'general.notificationEmail': 'me@example.test' });
      expect(await moneyReminders()).toHaveLength(0);
    });

    describe('on a day', () => {
      const at = new Date('2026-11-10T15:00:00Z'); // 21:00 on 10 November in Dhaka
      const fire = async () => {
        const [reminder] = await moneyReminders();
        await prisma.reminder.update({ where: { id: reminder!.id }, data: { nextFireAt: at } });
        await app.get(ReminderEngineService).tick(new Date(at.getTime() + 30_000));
        return (await prisma.reminderDelivery.findMany({ where: { reminderId: reminder!.id } })).map((d) => d.status);
      };

      it('is skipped when something was already logged that day', async () => {
        await reminders.syncDailyReminder();
        await spend('2026-11-10', 8_000, travel);
        expect(await fire()).toEqual(['skipped']);
      });

      it('is sent when nothing was logged that day', async () => {
        await reminders.syncDailyReminder();
        await spend('2026-11-09', 8_000, travel);
        // No device is subscribed in this test, so a real send is recorded as failed, not skipped.
        expect(await fire()).toEqual(['failed']);
      });

      it('is sent regardless when the owner turned skipping off', async () => {
        await call('patch', '/api/settings').send({
          'money.dailyReminder': { enabled: true, time: '21:00', channels: ['push'], skipIfLogged: false },
        });
        await spend('2026-11-10', 8_000, travel);
        expect(await fire()).toEqual(['failed']);
      });
    });
  });

  describe('budget warnings', () => {
    const budgetAlerts = async () =>
      (await moneyReminders()).filter((r) => r.ownerId?.startsWith('budget:')).map((r) => r.title);

    it('warns once at the warning level and once more when the budget is exceeded', async () => {
      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 100_000 });

      await spend(undefined, 70_000, food);
      expect(await budgetAlerts()).toEqual([]);

      await spend(undefined, 10_000, food); // 80%
      expect(await budgetAlerts()).toEqual(['Food budget: 80% used']);

      await spend(undefined, 5_000, food); // 85%, same level
      expect(await budgetAlerts()).toHaveLength(1);

      await spend(undefined, 20_000, food); // 105%
      expect(await budgetAlerts()).toEqual(['Food budget: 80% used', 'Food budget exceeded']);

      await spend(undefined, 1_000, food);
      expect(await budgetAlerts()).toHaveLength(2);
    });

    it('describes the amounts and opens the month view', async () => {
      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 100_000 });
      await spend(undefined, 125_050, food);
      const [alert] = (await moneyReminders()).filter((r) => r.ownerId?.startsWith('budget:'));
      expect(alert).toMatchObject({
        title: 'Food budget exceeded',
        body: 'Spent ৳1,250.50 of ৳1,000 this month.',
        url: '/money/month',
        channels: ['push'],
      });
      expect(alert!.schedule).toMatchObject({ kind: 'once' });
    });

    it('covers the whole-month budget too', async () => {
      await call('put', '/api/money/budgets').send({ categoryId: null, amount: 10_000 });
      await spend(undefined, 9_000, travel);
      expect(await budgetAlerts()).toEqual(['Monthly budget: 90% used']);
    });

    it('says nothing about a past month', async () => {
      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 1_000 });
      await spend('2026-09-10', 50_000, food);
      expect(await budgetAlerts()).toEqual([]);
    });

    it('uses the warning level from settings', async () => {
      await call('patch', '/api/settings').send({ 'money.budgetWarnPercent': 50 });
      await call('put', '/api/money/budgets').send({ categoryId: food, amount: 100_000 });
      await spend(undefined, 50_000, food);
      expect(await budgetAlerts()).toEqual(['Food budget: 50% used']);
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await spend('2026-10-02', 1_250, food, 'Tea, with "milk"');
      await spend('2026-10-03', 8_000, travel, '=SUM(A1:A9)');
      await call('post', '/api/money/entries').send({
        kind: 'transfer',
        date: '2026-10-04',
        amount: 200_000,
        accountId: bank,
        toAccountId: cash,
        note: 'for the week',
      });
    });

    it('includes money in the data download', async () => {
      const res = await call('get', '/api/export');
      expect(res.body.money.accounts).toHaveLength(3);
      expect(res.body.money.categories).toHaveLength(6);
      expect(res.body.money.entries).toHaveLength(3);
      expect(res.body.money).toHaveProperty('shortcuts');
      expect(res.body.money).toHaveProperty('budgets');
      expect(res.body.money).toHaveProperty('people');
    });

    it('downloads entries as a spreadsheet-safe CSV', async () => {
      const res = await call('get', '/api/export/money.csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="money-\d{4}-\d{2}-\d{2}\.csv"$/);
      const lines = res.text.trim().split('\r\n');
      expect(lines[0]).toBe('date,kind,name,amount,account,to_account,category,person,note');
      expect(lines).toHaveLength(4);
      // Oldest first, amounts in taka with two decimals.
      expect(lines[1]).toBe('2026-10-02,expense,"Tea, with ""milk""",12.50,Cash,,Food,,');
      // A leading = would run as a formula in a spreadsheet; it is defused with a quote mark.
      expect(lines[2]).toBe("2026-10-03,expense,'=SUM(A1:A9),80.00,Cash,,Travel,,");
      expect(lines[3]).toBe('2026-10-04,transfer,Bank to Cash,2000.00,Bank,Cash,,,for the week');
    });

    it('needs a session', async () => {
      expect((await http().get('/api/export/money.csv')).status).toBe(401);
      expect((await http().get('/api/money/reports/month')).status).toBe(401);
    });
  });
});
