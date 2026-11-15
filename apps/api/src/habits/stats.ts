import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { streak, summariseDay, type Outcome } from '@pa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { daySchema, fieldError, fromDbDate, toDbDate } from './common';
import { DaysService, type DayReport } from './days';

export interface DayScore {
  day: string;
  score: number;
  possible: number;
  target: number;
  won: boolean | null;
  skipped: boolean;
}

export interface ItemStats {
  itemId: string;
  name: string;
  archived: boolean;
  /** Points given up over the range: what was possible less what was scored. */
  lost: number;
  missed: number;
  late: number;
  onTime: number;
  /** Days in the range the item counted on (not skipped). */
  applied: number;
  missRate: number;
  /** Streaks over the item's whole history, not just the range. */
  current: number;
  best: number;
}

export interface TodayHabits {
  day: string;
  score: number;
  possible: number;
  target: number;
  won: boolean | null;
  next: DayReport['next'];
  done: number;
  total: number;
  skipped: boolean;
}

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

/** How the days have gone: scores over time, the weakest items, and streaks. */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: DaysService,
  ) {}

  async stats(from: string, to: string): Promise<{ days: DayScore[]; items: ItemStats[] }> {
    await this.days.ensureThrough();
    const today = await this.days.today();

    const closed = await this.prisma.habitDay.findMany({
      where: { day: { gte: toDbDate(from), lte: toDbDate(to) }, closedAt: { not: null } },
      include: { items: true },
      orderBy: { day: 'asc' },
    });

    const scores: DayScore[] = closed.map((row) => {
      const summary = summariseDay(
        row.items.map((item) => ({
          rules: { points: item.points, lateShare: item.lateShare, missMultiplier: item.missMultiplier },
          outcome: (row.skipped ? 'skipped' : (item.outcome ?? 'missed')) as Outcome,
        })),
        row.targetPercent,
      );
      return {
        day: fromDbDate(row.day),
        score: summary.score,
        possible: summary.possible,
        target: summary.target,
        won: summary.won,
        skipped: row.skipped,
      };
    });

    // Today is still running: it is on the chart as it stands, but not in the ranking.
    // It always counts towards streaks, whatever range was asked for.
    const live = await this.days.report(today);
    if (today >= from && today <= to) {
      if (live.items.length > 0) {
        scores.push({
          day: today,
          score: live.score,
          possible: live.possible,
          target: live.target,
          won: live.won,
          skipped: live.skipped,
        });
      }
    }

    const items = new Map<string, ItemStats>();
    const entry = (itemId: string, name: string): ItemStats => {
      let found = items.get(itemId);
      if (!found) {
        found = { itemId, name, archived: false, lost: 0, missed: 0, late: 0, onTime: 0, applied: 0, missRate: 0, current: 0, best: 0 };
        items.set(itemId, found);
      }
      // The newest day's name is the one shown.
      found.name = name;
      return found;
    };
    for (const row of closed) {
      for (const item of row.items) {
        const stats = entry(item.itemId, item.name);
        if (row.skipped || item.skipped || item.outcome === 'skipped') continue;
        stats.applied += 1;
        stats.lost += item.points - (item.score ?? 0);
        if (item.outcome === 'missed') stats.missed += 1;
        else if (item.outcome === 'late') stats.late += 1;
        else if (item.outcome === 'onTime') stats.onTime += 1;
      }
    }

    if (items.size > 0) {
      const ids = [...items.keys()];
      const [current, history] = await Promise.all([
        this.prisma.habitItem.findMany({ where: { id: { in: ids } } }),
        this.prisma.habitDayItem.findMany({
          where: { itemId: { in: ids }, habitDay: { closedAt: { not: null } } },
          include: { habitDay: { select: { skipped: true } } },
          orderBy: { day: 'asc' },
        }),
      ]);
      const runs = new Map<string, ('done' | 'missed' | 'skipped')[]>();
      for (const row of history) {
        const list = runs.get(row.itemId) ?? [];
        const skipped = row.habitDay.skipped || row.skipped || row.outcome === 'skipped';
        list.push(skipped ? 'skipped' : row.outcome === 'missed' ? 'missed' : 'done');
        runs.set(row.itemId, list);
      }
      // A thing already done today extends its streak; one not yet done does not break it.
      for (const item of live.items) {
        if (item.outcome === 'onTime' || item.outcome === 'late') runs.get(item.itemId)?.push('done');
      }
      for (const stats of items.values()) {
        const row = current.find((item) => item.id === stats.itemId);
        stats.archived = !row || row.archivedAt !== null;
        if (row && !stats.archived) stats.name = row.name;
        stats.missRate = stats.applied === 0 ? 0 : stats.missed / stats.applied;
        Object.assign(stats, streak(runs.get(stats.itemId) ?? []));
      }
    }

    return {
      days: scores,
      items: [...items.values()].sort((a, b) => b.lost - a.lost || b.missRate - a.missRate || a.name.localeCompare(b.name)),
    };
  }

  async today(): Promise<TodayHabits> {
    const report = await this.days.report(await this.days.today());
    return {
      day: report.day,
      score: report.score,
      possible: report.possible,
      target: report.target,
      won: report.won,
      next: report.next,
      done: report.items.filter((item) => item.outcome === 'onTime' || item.outcome === 'late').length,
      total: report.items.filter((item) => item.outcome !== 'skipped').length,
      skipped: report.skipped,
    };
  }
}

@Controller('habits')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('stats')
  stats(@Query('from') from?: string, @Query('to') to?: string) {
    const day = (value: string | undefined, path: string) => {
      const parsed = daySchema.safeParse(value);
      if (!parsed.success) throw fieldError(path, parsed.error.issues[0]!.message);
      return parsed.data;
    };
    const start = day(from, 'from');
    const end = day(to, 'to');
    if (end < start) throw fieldError('to', 'The end must not be before the start');
    const length = (toDbDate(end).getTime() - toDbDate(start).getTime()) / DAY_MS + 1;
    if (length > MAX_RANGE_DAYS) throw fieldError('to', 'Ask for a year or less at a time');
    return this.service.stats(start, end);
  }

  @Get('today')
  today(): Promise<TodayHabits> {
    return this.service.today();
  }
}
