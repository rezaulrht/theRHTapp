import { Controller, Get, Injectable, Query } from '@nestjs/common';
import {
  type BudgetState,
  budgetState,
  type Comparison,
  compare,
  monthOf,
  previousMonth,
  spendingByDayType,
  summariseMonth,
  todayIn,
} from '@pa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AccountsService } from './accounts.service';
import { BudgetsService } from './budgets';
import { CategoriesService } from './categories.service';
import { daySchema, fieldError, toDbDate } from './common';
import { type EntryJson, EntriesService } from './entries.service';

export interface CategoryLine {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  archived: boolean;
  spent: number;
  /** This category's part of the month's spending, 0 to 1. */
  share: number;
  /** Spent in the month before. Null when there is no earlier month at all. */
  previous: number | null;
  budget: number | null;
  state: BudgetState | null;
}

export interface MonthReport {
  month: string;
  spent: Comparison;
  income: Comparison;
  byCategory: CategoryLine[];
  overall: { budget: number | null; state: BudgetState | null };
  byDayType: { dayTypeId: string; name: string; total: number; days: number; average: number }[];
  /** False in the first month the owner ever logged anything. */
  hasEarlierMonth: boolean;
}

export interface DayReport {
  date: string;
  spent: number;
  income: number;
  entries: EntryJson[];
}

export interface TodayReport {
  date: string;
  spent: number;
  comparedToSameWeekdayLastWeek: Comparison;
  balances: { id: string; name: string; balance: number }[];
}

function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function lastDayOf(month: string): string {
  const [year = 1970, monthNumber = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

/** Read-only summaries built from the entries. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly entries: EntriesService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly budgets: BudgetsService,
  ) {}

  private async spentOn(day: string): Promise<number> {
    const total = await this.prisma.moneyEntry.aggregate({
      where: { kind: 'expense', date: toDbDate(day) },
      _sum: { amount: true },
    });
    return total._sum.amount ?? 0;
  }

  async day(date: string): Promise<DayReport> {
    const entries = await this.entries.list({ date, limit: 1000 });
    const sum = (kind: string) =>
      entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.amount, 0);
    return { date, spent: sum('expense'), income: sum('income'), entries };
  }

  async month(month: string | undefined): Promise<MonthReport> {
    const settings = await this.settings.getAll();
    const current = month ?? monthOf(todayIn(settings['general.timezone']));
    const previous = previousMonth(current);
    const firstDay = `${current}-01`;

    const [ledger, earlier, categories, budgets] = await Promise.all([
      this.entries.ledger({
        date: { gte: toDbDate(`${previous}-01`), lte: toDbDate(lastDayOf(current)) },
      }),
      this.prisma.moneyEntry.count({ where: { date: { lt: toDbDate(firstDay) } } }),
      this.categories.list(true),
      this.budgets.list(),
    ]);
    const hasEarlierMonth = earlier > 0;
    const now = summariseMonth(current, ledger);
    const before = summariseMonth(previous, ledger);
    const warn = settings['money.budgetWarnPercent'];

    const spentBefore = new Map(before.byCategory.map((line) => [line.categoryId, line.spent]));
    const budgetFor = new Map(budgets.map((budget) => [budget.categoryId, budget.amount]));
    const meta = new Map(categories.map((category) => [category.id, category]));

    const line = (categoryId: string | null, spent: number, share: number): CategoryLine => {
      const category = categoryId ? meta.get(categoryId) : undefined;
      const budget = categoryId ? (budgetFor.get(categoryId) ?? null) : null;
      return {
        categoryId,
        name: category?.name ?? 'No category',
        color: category?.color ?? 'sage',
        icon: category?.icon ?? 'dot',
        archived: category?.archived ?? false,
        spent,
        share,
        previous: hasEarlierMonth ? (spentBefore.get(categoryId) ?? 0) : null,
        budget,
        state: budget === null ? null : budgetState(spent, budget, warn),
      };
    };

    const byCategory = now.byCategory.map((entry) => line(entry.categoryId, entry.spent, entry.share));
    // A budget with nothing spent against it yet still belongs in the picture.
    for (const budget of budgets) {
      if (budget.categoryId && !byCategory.some((entry) => entry.categoryId === budget.categoryId)) {
        byCategory.push(line(budget.categoryId, 0, 0));
      }
    }

    const overallBudget = budgetFor.get(null) ?? null;
    const dayTypeNames = new Map(settings['general.dayTypes'].map((dayType) => [dayType.id, dayType.name]));
    const thisMonth = ledger.filter((entry) => monthOf(entry.date) === current);

    return {
      month: current,
      spent: compare(now.spent, hasEarlierMonth ? before.spent : null),
      income: compare(now.income, hasEarlierMonth ? before.income : null),
      byCategory,
      overall: {
        budget: overallBudget,
        state: overallBudget === null ? null : budgetState(now.spent, overallBudget, warn),
      },
      byDayType: spendingByDayType(thisMonth, settings['general.weekPattern']).map((group) => ({
        dayTypeId: group.dayTypeId,
        name: dayTypeNames.get(group.dayTypeId) ?? group.dayTypeId,
        total: group.total,
        days: group.days,
        average: group.average,
      })),
      hasEarlierMonth,
    };
  }

  async today(): Promise<TodayReport> {
    const date = todayIn(await this.settings.get('general.timezone'));
    const lastWeek = addDays(date, -7);
    const [spent, spentLastWeek, history, accounts] = await Promise.all([
      this.spentOn(date),
      this.spentOn(lastWeek),
      this.prisma.moneyEntry.count({ where: { date: { lte: toDbDate(lastWeek) } } }),
      this.accounts.list(),
    ]);
    return {
      date,
      spent,
      // With no history that far back, zero would read as "you spent nothing"; say nothing instead.
      comparedToSameWeekdayLastWeek: compare(spent, history > 0 ? spentLastWeek : null),
      balances: accounts.map((account) => ({ id: account.id, name: account.name, balance: account.balance })),
    };
  }
}

@Controller('money/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('day')
  day(@Query('date') date?: string): Promise<DayReport> {
    const parsed = daySchema.safeParse(date);
    if (!parsed.success) throw fieldError('date', parsed.error.issues[0]!.message);
    return this.reports.day(parsed.data);
  }

  @Get('month')
  month(@Query('month') month?: string): Promise<MonthReport> {
    if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw fieldError('month', 'Use a month like 2026-11');
    }
    return this.reports.month(month);
  }

  @Get('today')
  today(): Promise<TodayReport> {
    return this.reports.today();
  }
}
