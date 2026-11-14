import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Reminder } from '@pa/db';
import { budgetState, monthOf, summariseMonth, todayIn } from '@pa/shared';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService, type ReminderInput } from '../reminders/reminder-engine.service';
import type { ReminderGate } from '../reminders/reminder-gate';
import { SettingsService } from '../settings/settings.service';
import { BudgetsService } from './budgets';
import { CategoriesService } from './categories.service';
import { toDbDate } from './common';
import { EntriesService } from './entries.service';

const DAILY = 'daily-log';
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** 125050 paisa as "1,250.50"; whole taka amounts drop the decimals. */
function taka(paisa: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: paisa % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paisa / 100);
}

/**
 * Money's two kinds of reminder: the daily nudge to log spending, and a
 * one-off alert each time a budget reaches its warning level or is exceeded.
 */
@Injectable()
export class MoneyRemindersService implements OnModuleInit, ReminderGate {
  readonly ownerType = 'money';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: ReminderEngineService,
    private readonly entries: EntriesService,
    private readonly budgets: BudgetsService,
    private readonly categories: CategoriesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    this.engine.registerGate(this);
    this.settings.onChange(async (changed) => {
      if (changed.includes('money.dailyReminder')) await this.syncDailyReminder();
    });
    this.entries.onSpendingChanged(async (months) => {
      for (const month of months) await this.checkBudgets(month);
    });
    // Tests set up exactly the reminders they want.
    if (this.env.NODE_ENV !== 'test') await this.syncDailyReminder();
  }

  /** Makes the stored daily reminder match the `money.dailyReminder` setting. */
  async syncDailyReminder(): Promise<void> {
    const config = await this.settings.get('money.dailyReminder');
    const existing = await this.prisma.reminder.findFirst({ where: { ownerType: 'money', ownerId: DAILY } });

    if (!config.enabled) {
      if (existing) await this.engine.remove(existing.id);
      return;
    }
    const input: ReminderInput = {
      ownerType: 'money',
      ownerId: DAILY,
      title: "Log today's spending",
      body: 'Add what you spent today while you still remember.',
      url: '/money',
      schedule: { kind: 'weekly', days: EVERY_DAY, time: config.time },
      channels: config.channels,
      enabled: true,
    };
    if (existing) await this.engine.update(existing.id, input);
    else await this.engine.create(input);
  }

  /** The daily nudge is pointless on a day that already has entries. */
  async shouldSend(reminder: Reminder, occurrenceAt: Date): Promise<boolean> {
    if (reminder.ownerId !== DAILY) return true;
    const config = await this.settings.get('money.dailyReminder');
    if (!config.skipIfLogged) return true;
    const day = todayIn(await this.settings.get('general.timezone'), occurrenceAt);
    const logged = await this.prisma.moneyEntry.count({ where: { date: toDbDate(day) } });
    return logged === 0;
  }

  /**
   * Alerts once per budget, per month, per level (warning, then exceeded).
   * Only the current month matters: editing old entries should not ring bells.
   */
  async checkBudgets(month: string): Promise<void> {
    const settings = await this.settings.getAll();
    if (month !== monthOf(todayIn(settings['general.timezone']))) return;

    const budgets = await this.budgets.list();
    if (budgets.length === 0) return;

    const [year = 1970, monthNumber = 1] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0));
    const summary = summariseMonth(
      month,
      await this.entries.ledger({ kind: 'expense', date: { gte: toDbDate(`${month}-01`), lte: lastDay } }),
    );
    const spentIn = new Map(summary.byCategory.map((line) => [line.categoryId, line.spent]));
    const names = new Map((await this.categories.list(true)).map((category) => [category.id, category.name]));
    const symbol = settings['general.currency'].symbol;

    for (const budget of budgets) {
      const spent = budget.categoryId === null ? summary.spent : (spentIn.get(budget.categoryId) ?? 0);
      const state = budgetState(spent, budget.amount, settings['money.budgetWarnPercent']);
      if (state === 'ok') continue;

      const ownerId = `budget:${budget.categoryId ?? 'all'}:${month}:${state}`;
      const already = await this.prisma.reminder.count({ where: { ownerType: 'money', ownerId } });
      if (already > 0) continue;

      const label = budget.categoryId === null ? 'Monthly' : (names.get(budget.categoryId) ?? 'Category');
      const used = Math.floor((spent * 100) / budget.amount);
      await this.engine.create({
        ownerType: 'money',
        ownerId,
        title: state === 'over' ? `${label} budget exceeded` : `${label} budget: ${used}% used`,
        body: `Spent ${symbol}${taka(spent)} of ${symbol}${taka(budget.amount)} this month.`,
        url: '/money/month',
        schedule: { kind: 'once', at: new Date().toISOString() },
        channels: settings['money.dailyReminder'].channels,
      });
    }
  }
}
