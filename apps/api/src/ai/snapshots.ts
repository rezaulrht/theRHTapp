import { Injectable } from '@nestjs/common';
import { monthOf, todayIn } from '@pa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DaysService } from '../habits/days';
import { fromDbDate, toDbDate } from '../habits/common';
import { StatsService } from '../habits/stats';
import { CategoriesService } from '../money/categories.service';
import { AccountsService } from '../money/accounts.service';
import { EntriesService } from '../money/entries.service';
import { ReportsService } from '../money/reports';
import { SettingsService } from '../settings/settings.service';

const taka = (paisa: number): number => Math.round(paisa) / 100;
const points = (hundredths: number): number => Math.round(hundredths) / 100;

function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayOf = (day: string): string => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;

export interface BudgetLine {
  name: string;
  spent: number;
  budget: number;
  /** Where the month ends up at the pace so far. */
  projected: number;
  willPass: boolean;
}

/** Spending so far in a month, carried to the month's end at the same daily pace. Amounts in paisa. */
export function projectMonth(spent: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return spent;
  return Math.round((spent / dayOfMonth) * daysInMonth);
}

export function daysInMonthOf(month: string): number {
  const [year = 1970, number = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

/** The facts the assistant reads. Each is compact JSON text, so a question costs little. */
@Injectable()
export class SnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly reports: ReportsService,
    private readonly entries: EntriesService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly stats: StatsService,
    private readonly days: DaysService,
  ) {}

  async today(): Promise<{ today: string; timeZone: string; symbol: string }> {
    const settings = await this.settings.getAll();
    return {
      today: todayIn(settings['general.timezone']),
      timeZone: settings['general.timezone'],
      symbol: settings['general.currency'].symbol,
    };
  }

  /** Spending this month and last, the last 30 days, the biggest purchases and the balances. */
  async money(): Promise<string> {
    const { today } = await this.today();
    const month = monthOf(today);
    const [report, categories, entries, accounts] = await Promise.all([
      this.reports.month(month),
      this.categories.list(true),
      this.entries.list({ from: addDays(today, -29), to: today, limit: 2000 }),
      this.accounts.list(),
    ]);
    const nameOf = new Map(categories.map((category) => [category.id, category.name]));
    const expenses = entries.filter((entry) => entry.kind === 'expense');
    const daily: Record<string, number> = {};
    for (const entry of expenses) daily[entry.date] = (daily[entry.date] ?? 0) + entry.amount;

    return JSON.stringify({
      month,
      thisMonth: { spent: taka(report.spent.current), income: taka(report.income.current) },
      lastMonthSpent: report.spent.previous === null ? null : taka(report.spent.previous),
      monthBudget: report.overall.budget === null ? null : taka(report.overall.budget),
      byCategory: report.byCategory
        .filter((line) => line.spent > 0 || line.budget !== null)
        .slice(0, 14)
        .map((line) => ({
          category: line.name,
          spent: taka(line.spent),
          lastMonth: line.previous === null ? null : taka(line.previous),
          budget: line.budget === null ? null : taka(line.budget),
        })),
      spentPerDayLast30: Object.fromEntries(Object.entries(daily).sort().map(([day, total]) => [day, taka(total)])),
      biggestPurchasesLast30: [...expenses]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((entry) => ({ date: entry.date, name: entry.name, category: entry.categoryId ? (nameOf.get(entry.categoryId) ?? null) : null, amount: taka(entry.amount) })),
      balances: accounts.map((account) => ({ account: account.name, balance: taka(account.balance) })),
    });
  }

  /** Pace against each budget for the month so far, or null when no budget is set. */
  async budget(): Promise<{ lines: BudgetLine[]; context: string } | null> {
    const { today } = await this.today();
    const month = monthOf(today);
    const report = await this.reports.month(month);
    const dayOfMonth = Number(today.slice(8, 10));
    const daysInMonth = daysInMonthOf(month);

    const lines: BudgetLine[] = [];
    if (report.overall.budget !== null) {
      const projected = projectMonth(report.spent.current, dayOfMonth, daysInMonth);
      lines.push({ name: 'The whole month', spent: report.spent.current, budget: report.overall.budget, projected, willPass: projected > report.overall.budget });
    }
    for (const line of report.byCategory) {
      if (line.budget === null) continue;
      const projected = projectMonth(line.spent, dayOfMonth, daysInMonth);
      lines.push({ name: line.name, spent: line.spent, budget: line.budget, projected, willPass: projected > line.budget });
    }
    if (lines.length === 0) return null;
    return {
      lines,
      context: JSON.stringify({
        today,
        dayOfMonth,
        daysInMonth,
        lines: lines.map((line) => ({ name: line.name, spent: taka(line.spent), budget: taka(line.budget), projectedAtMonthEnd: taka(line.projected), willPassBudget: line.willPass })),
      }),
    };
  }

  /** How the habit days and each item have gone over the last 30 days. */
  async habits(): Promise<string> {
    const { today } = await this.today();
    const { days, items } = await this.stats.stats(addDays(today, -29), today);
    return JSON.stringify({
      days: days.map((day) => ({ day: day.day, weekday: weekdayOf(day.day), score: points(day.score), possible: points(day.possible), target: points(day.target), won: day.won, skipped: day.skipped })),
      items: items
        .filter((item) => !item.archived)
        .map((item) => ({
          item: item.name,
          missedPercent: Math.round(item.missRate * 100),
          missed: item.missed,
          late: item.late,
          onTime: item.onTime,
          pointsLost: points(item.lost),
          currentStreak: item.current,
          bestStreak: item.best,
        })),
    });
  }

  /** Every item's outcome on each of the last 28 closed days, as a grid of letters. */
  async coach(): Promise<{ context: string; days: number }> {
    const { today } = await this.today();
    const rows = await this.prisma.habitDay.findMany({
      where: { day: { gte: toDbDate(addDays(today, -28)), lte: toDbDate(addDays(today, -1)) }, closedAt: { not: null } },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { day: 'asc' },
    });
    const order: string[] = [];
    const names = new Map<string, string>();
    for (const row of rows) {
      for (const item of row.items) {
        if (!names.has(item.itemId)) {
          names.set(item.itemId, item.name);
          order.push(item.itemId);
        }
      }
    }
    const code = (outcome: string | null, skipped: boolean): string =>
      skipped || outcome === 'skipped' ? 'S' : outcome === 'onTime' ? 'D' : outcome === 'late' ? 'L' : outcome === 'missed' ? 'M' : '-';
    const grid = rows.map((row) => {
      const byItem = new Map(row.items.map((item) => [item.itemId, item]));
      const day = fromDbDate(row.day);
      return {
        day,
        weekday: weekdayOf(day),
        skippedDay: row.skipped,
        outcomes: order.map((id) => {
          const item = byItem.get(id);
          return item ? code(item.outcome, row.skipped || item.skipped) : '-';
        }).join(''),
      };
    });
    return { context: JSON.stringify({ itemsInOrder: order.map((id) => names.get(id)), days: grid }), days: rows.length };
  }

  /** One habit day as it stands. */
  async dayOfHabits(day?: string): Promise<{ context: string; day: string }> {
    const date = day ?? (await this.days.today());
    const report = await this.days.report(date);
    return {
      day: date,
      context: JSON.stringify({
        day: date,
        weekday: weekdayOf(date),
        closed: report.closed,
        skippedDay: report.skipped,
        score: points(report.score),
        possible: points(report.possible),
        target: points(report.target),
        won: report.won,
        pointsLost: points(report.lost),
        items: report.items.map((item) => ({ item: item.name, outcome: item.outcome, worth: points(item.points), scored: points(item.score) })),
      }),
    };
  }

  /** This week and the one before, for the weekly review: money and habits only. */
  async week(): Promise<string> {
    const { today } = await this.today();
    const from = addDays(today, -6);
    const [thisWeek, lastWeek, categories, habits] = await Promise.all([
      this.entries.list({ from, to: today, limit: 2000 }),
      this.entries.list({ from: addDays(from, -7), to: addDays(from, -1), limit: 2000 }),
      this.categories.list(true),
      this.stats.stats(from, today),
    ]);
    const nameOf = new Map(categories.map((category) => [category.id, category.name]));
    const spent = (entries: typeof thisWeek) => entries.filter((entry) => entry.kind === 'expense').reduce((sum, entry) => sum + entry.amount, 0);
    const byCategory = new Map<string, number>();
    for (const entry of thisWeek) {
      if (entry.kind !== 'expense') continue;
      const name = entry.categoryId ? (nameOf.get(entry.categoryId) ?? 'Other') : 'Other';
      byCategory.set(name, (byCategory.get(name) ?? 0) + entry.amount);
    }
    return JSON.stringify({
      from,
      to: today,
      money: {
        spentThisWeek: taka(spent(thisWeek)),
        spentWeekBefore: taka(spent(lastWeek)),
        topCategories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, total]) => ({ category: name, spent: taka(total) })),
      },
      habits: {
        daysWon: habits.days.filter((day) => day.won === true).length,
        daysLost: habits.days.filter((day) => day.won === false).length,
        daysCounted: habits.days.filter((day) => !day.skipped).length,
        itemsThatLostMost: habits.items.filter((item) => item.lost > 0).slice(0, 3).map((item) => ({ item: item.name, pointsLost: points(item.lost), missed: item.missed })),
      },
    });
  }
}
