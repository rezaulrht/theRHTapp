import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { HabitDay, HabitDayItem, HabitItem, HabitMark } from '@pa/db';
import {
  appliesOn,
  habitDayBounds,
  habitDayOf,
  outcomeFor,
  scoreFor,
  summariseDay,
  windowFor,
  type AppliesTo,
  type DayContext,
  type Outcome,
  type PrayerTimes,
  type Settings,
  type Timing,
} from '@pa/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { daySchema, fieldError, fromDbDate, toDbDate } from './common';
import { ItemsService } from './items';
import { prayerTimesFor } from './prayer-times';

export interface DayItemJson {
  itemId: string;
  name: string;
  points: number;
  timing: Timing;
  opensAt: string | null;
  dueAt: string;
  outcome: Outcome;
  score: number;
  skipped: boolean;
  marks: { id: string; at: string }[];
  /** How many times a repeating item is to be done; null for a one-off item. */
  target: number | null;
}

export interface DayReport {
  day: string;
  isToday: boolean;
  /** The day has ended and its result is final unless it is corrected. */
  closed: boolean;
  skipped: boolean;
  skippedReason: string | null;
  prayers: PrayerTimes;
  score: number;
  possible: number;
  lost: number;
  target: number;
  won: boolean | null;
  /** `at` is when it opens or is due; null when it can be done any time before the day ends. */
  next: { itemId: string; name: string; at: string | null } | null;
  items: DayItemJson[];
}

type DayRow = HabitDay & { items: HabitDayItem[] };

/** Settings that change what today's routine looks like. */
const DAY_SETTINGS = ['general.timezone', 'general.location', 'general.weekPattern', 'general.dayTypes'];
/** A safety limit on how many missed days are filled in at once. */
const MAX_BACKFILL_DAYS = 400;
/** A tick may be this far ahead of the server's clock before it is refused. */
const CLOCK_SLACK_MS = 60_000;

const markSchema = z.object({ itemId: z.string().min(1, 'Pick an item'), at: z.iso.datetime({ offset: true }).optional() });
const moveSchema = z.object({ at: z.iso.datetime({ offset: true }) });
const skipSchema = z.object({ reason: z.string().trim().max(200, 'Use a shorter reason').optional() });

function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

type Listener = () => Promise<void> | void;

/**
 * Habit days. Each day holds a frozen copy of the items that applied to it;
 * outcomes and scores are always worked out from that copy and the ticks, so
 * a past day is never re-scored with today's rules.
 */
@Injectable()
export class DaysService implements OnModuleInit {
  private readonly logger = new Logger(DaysService.name);
  private readonly listeners: Listener[] = [];
  /** The time now. Tests replace it. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly items: ItemsService,
  ) {}

  onModuleInit(): void {
    this.items.clock = () => this.clock();
    this.items.onChanged(() => this.refreshToday());
    this.settings.onChange(async (changed) => {
      if (changed.some((key) => key.startsWith('habits.') || DAY_SETTINGS.includes(key))) await this.refreshToday();
    });
  }

  /** Called after a day or item is skipped or unskipped, or today's routine is rebuilt. */
  onChanged(listener: Listener): void {
    this.listeners.push(listener);
  }

  private async changed(): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener();
      } catch (error) {
        this.logger.error(`A habit day listener failed: ${String(error)}`);
      }
    }
  }

  async today(): Promise<string> {
    const settings = await this.settings.getAll();
    return habitDayOf(this.clock(), settings['general.timezone'], settings['habits.dayEndHour']);
  }

  private context(day: string, settings: Settings): DayContext {
    return {
      timeZone: settings['general.timezone'],
      dayEndHour: settings['habits.dayEndHour'],
      prayers: prayerTimesFor(day, settings),
    };
  }

  /** Whether an item was on the routine on a given habit day. */
  private applied(item: HabitItem, day: string, settings: Settings): boolean {
    const dayOf = (instant: Date) => habitDayOf(instant, settings['general.timezone'], settings['habits.dayEndHour']);
    if (dayOf(item.createdAt) > day) return false;
    if (item.archivedAt && dayOf(item.archivedAt) <= day) return false;
    if (item.pausedAt && dayOf(item.pausedAt) <= day) return false;
    return appliesOn(item.appliesTo as unknown as AppliesTo, day, settings['general.weekPattern']);
  }

  private snapshot(item: HabitItem, day: string, settings: Settings, context: DayContext) {
    const timing = item.timing as unknown as Timing;
    const window = windowFor(timing, day, context);
    return {
      name: item.name,
      points: item.points,
      lateShare: item.lateShare ?? settings['habits.lateShare'],
      missMultiplier: item.missMultiplier ?? settings['habits.missMultiplier'],
      timing,
      opensAt: window.opensAt,
      dueAt: window.dueAt,
      sortOrder: item.sortOrder,
    };
  }

  /** Creates a day and its copy of the routine, if it does not exist yet. */
  async ensureDay(day: string, settings?: Settings, items?: HabitItem[]): Promise<void> {
    const date = toDbDate(day);
    if (await this.prisma.habitDay.findUnique({ where: { day: date } })) return;
    const using = settings ?? (await this.settings.getAll());
    const routine = (items ?? (await this.items.rows(true))).filter((item) => this.applied(item, day, using));
    const context = this.context(day, using);
    await this.prisma.habitDay.create({
      data: {
        day: date,
        targetPercent: using['habits.dailyTargetPercent'],
        items: { create: routine.map((item) => ({ itemId: item.id, ...this.snapshot(item, day, using, context) })) },
      },
    });
  }

  /**
   * Rebuilds the current day's copy of the routine from the items and settings
   * as they are now. Ticks and item skips are kept. Ended days are not touched.
   */
  async refreshToday(): Promise<void> {
    const settings = await this.settings.getAll();
    const day = habitDayOf(this.clock(), settings['general.timezone'], settings['habits.dayEndHour']);
    const date = toDbDate(day);
    const existing = await this.prisma.habitDay.findUnique({ where: { day: date }, include: { items: true } });
    if (!existing) {
      await this.ensureThrough();
      await this.changed();
      return;
    }
    if (existing.closedAt) return;

    const routine = (await this.items.rows(true)).filter((item) => this.applied(item, day, settings));
    const context = this.context(day, settings);
    const keep = new Set(routine.map((item) => item.id));
    await this.prisma.$transaction([
      this.prisma.habitDay.update({ where: { day: date }, data: { targetPercent: settings['habits.dailyTargetPercent'] } }),
      this.prisma.habitDayItem.deleteMany({ where: { day: date, itemId: { notIn: [...keep] } } }),
      ...routine.map((item) => {
        const copy = this.snapshot(item, day, settings, context);
        return this.prisma.habitDayItem.upsert({
          where: { day_itemId: { day: date, itemId: item.id } },
          create: { day: date, itemId: item.id, ...copy },
          update: copy,
        });
      }),
    ]);
    await this.changed();
  }

  /**
   * Fills in every day from the first item's first day up to today, and
   * stores the result of each day that has ended. A day the app was never
   * opened on is created here, with everything on it missed.
   */
  async ensureThrough(): Promise<void> {
    const settings = await this.settings.getAll();
    const now = this.clock();
    const today = habitDayOf(now, settings['general.timezone'], settings['habits.dayEndHour']);
    const items = await this.items.rows(true);
    if (items.length === 0) return;

    const first = items
      .map((item) => habitDayOf(item.createdAt, settings['general.timezone'], settings['habits.dayEndHour']))
      .sort()[0]!;
    const latest = await this.prisma.habitDay.findFirst({ orderBy: { day: 'desc' } });
    let day = latest ? addDays(fromDbDate(latest.day), 1) : first;
    if (day < addDays(today, -MAX_BACKFILL_DAYS)) day = addDays(today, -MAX_BACKFILL_DAYS);
    for (; day <= today; day = addDays(day, 1)) await this.ensureDay(day, settings, items);

    const open = await this.prisma.habitDay.findMany({
      where: { closedAt: null, day: { lt: toDbDate(today) } },
      include: { items: true },
    });
    for (const row of open) await this.close(row, now);
  }

  /** Stores each item's final outcome and score for an ended day. */
  private async close(row: DayRow, now: Date): Promise<void> {
    const marks = await this.prisma.habitMark.findMany({ where: { day: row.day } });
    const results = this.evaluate(row, marks);
    await this.prisma.$transaction([
      ...results.map((result) =>
        this.prisma.habitDayItem.update({
          where: { id: result.rowId },
          data: { outcome: result.outcome, score: result.score },
        }),
      ),
      this.prisma.habitDay.update({ where: { day: row.day }, data: { closedAt: row.closedAt ?? now } }),
    ]);
  }

  /**
   * Outcome and score for every item of a day. With no `live` clock the day
   * has ended, so anything undone is missed whenever it is looked at.
   */
  private evaluate(row: DayRow, marks: HabitMark[], live?: { now: Date; dayEnd: Date }) {
    const ended = { now: new Date(1), dayEnd: new Date(0) };
    return row.items.map((item) => {
      const timing = item.timing as unknown as Timing;
      const own = marks.filter((mark) => mark.itemId === item.itemId).sort((x, y) => x.at.getTime() - y.at.getTime());
      const skipped = row.skipped || item.skipped;
      const outcome = outcomeFor({
        timing,
        window: { opensAt: item.opensAt, dueAt: item.dueAt },
        marks: own.map((mark) => mark.at),
        skipped,
        ...(live ?? ended),
      });
      const rules = { points: item.points, lateShare: item.lateShare, missMultiplier: item.missMultiplier };
      return { rowId: item.id, item, timing, marks: own, skipped, outcome, rules, score: scoreFor(rules, outcome) };
    });
  }

  private async load(day: string): Promise<DayRow> {
    const row = await this.prisma.habitDay.findUnique({ where: { day: toDbDate(day) }, include: { items: true } });
    if (!row) throw new NotFoundException('There is no routine for that day');
    return row;
  }

  /** Checks a day can be read or changed: a real day, not in the future. */
  private async checkDay(day: string): Promise<{ settings: Settings; today: string }> {
    const settings = await this.settings.getAll();
    const today = habitDayOf(this.clock(), settings['general.timezone'], settings['habits.dayEndHour']);
    if (day > today) throw fieldError('day', 'That day has not started yet');
    return { settings, today };
  }

  async report(day: string): Promise<DayReport> {
    const { settings, today } = await this.checkDay(day);
    await this.ensureThrough();
    const now = this.clock();
    const row = await this.prisma.habitDay.findUnique({ where: { day: toDbDate(day) }, include: { items: true } });
    const prayers = prayerTimesFor(day, settings);

    if (!row) {
      // Before the routine existed: nothing to show and nothing to score.
      return {
        day,
        isToday: day === today,
        closed: day < today,
        skipped: false,
        skippedReason: null,
        prayers,
        score: 0,
        possible: 0,
        lost: 0,
        target: 0,
        won: null,
        next: null,
        items: [],
      };
    }

    const marks = await this.prisma.habitMark.findMany({ where: { day: row.day } });
    const isToday = day === today;
    const dayEnd = habitDayBounds(day, settings['general.timezone'], settings['habits.dayEndHour']).end;
    const results = this.evaluate(row, marks, isToday ? { now, dayEnd } : undefined);
    const summary = summariseDay(results, row.targetPercent);

    const ordered = [...results].sort(
      (a, b) =>
        (a.item.opensAt ?? a.item.dueAt).getTime() - (b.item.opensAt ?? b.item.dueAt).getTime() ||
        a.item.sortOrder - b.item.sortOrder,
    );
    const upcoming = isToday
      ? ordered.find((result) => result.outcome === 'pending' && result.item.dueAt.getTime() > now.getTime())
      : undefined;

    return {
      day,
      isToday,
      closed: !isToday,
      skipped: row.skipped,
      skippedReason: row.skippedReason,
      prayers,
      ...summary,
      next: upcoming
        ? {
            itemId: upcoming.item.itemId,
            name: upcoming.item.name,
            at:
              upcoming.item.opensAt && upcoming.item.opensAt.getTime() > now.getTime()
                ? upcoming.item.opensAt.toISOString()
                : upcoming.item.dueAt.getTime() >= dayEnd.getTime()
                  ? null
                  : upcoming.item.dueAt.toISOString(),
          }
        : null,
      items: ordered.map((result) => ({
        itemId: result.item.itemId,
        name: result.item.name,
        points: result.item.points,
        timing: result.timing,
        opensAt: result.item.opensAt?.toISOString() ?? null,
        dueAt: result.item.dueAt.toISOString(),
        outcome: result.outcome,
        score: result.score,
        skipped: result.skipped,
        marks: result.marks.map((mark) => ({ id: mark.id, at: mark.at.toISOString() })),
        target: result.timing.kind === 'repeating' ? result.timing.target : null,
      })),
    };
  }

  /** After a past day is corrected, its stored result is worked out again. */
  private async reclose(day: string, today: string): Promise<void> {
    if (day >= today) return;
    await this.close(await this.load(day), this.clock());
  }

  private checkInstant(at: Date, day: string, settings: Settings): void {
    const bounds = habitDayBounds(day, settings['general.timezone'], settings['habits.dayEndHour']);
    if (at.getTime() < bounds.start.getTime() || at.getTime() >= bounds.end.getTime()) {
      throw fieldError('at', 'That time is not on this day');
    }
    if (at.getTime() > this.clock().getTime() + CLOCK_SLACK_MS) {
      throw fieldError('at', 'That time has not come yet');
    }
  }

  /** One tap: the item was done. A one-off item keeps a single tick. */
  async addMark(day: string, itemId: string, at?: string): Promise<DayReport> {
    const { settings, today } = await this.checkDay(day);
    await this.ensureThrough();
    const row = await this.load(day);
    const item = row.items.find((candidate) => candidate.itemId === itemId);
    if (!item) throw fieldError('itemId', 'That item is not on this day');

    const repeating = (item.timing as unknown as Timing).kind === 'repeating';
    const already = await this.prisma.habitMark.count({ where: { day: row.day, itemId } });
    if (repeating || already === 0) {
      const bounds = habitDayBounds(day, settings['general.timezone'], settings['habits.dayEndHour']);
      // Ticking a past day without a time means "I did it on time"; the time can be corrected.
      const fallback =
        day === today ? this.clock() : new Date(Math.min(item.dueAt.getTime(), bounds.end.getTime() - 1));
      const instant = at ? new Date(at) : fallback;
      this.checkInstant(instant, day, settings);
      await this.prisma.habitMark.create({ data: { day: row.day, itemId, at: instant } });
      await this.reclose(day, today);
    }
    return this.report(day);
  }

  private async findMark(id: string): Promise<HabitMark> {
    const mark = await this.prisma.habitMark.findUnique({ where: { id } });
    if (!mark) throw new NotFoundException('That tick does not exist');
    return mark;
  }

  /** Corrects when an item was really done. */
  async moveMark(id: string, at: string): Promise<DayReport> {
    const mark = await this.findMark(id);
    const day = fromDbDate(mark.day);
    const { settings, today } = await this.checkDay(day);
    this.checkInstant(new Date(at), day, settings);
    await this.prisma.habitMark.update({ where: { id }, data: { at: new Date(at) } });
    await this.reclose(day, today);
    return this.report(day);
  }

  async removeMark(id: string): Promise<DayReport> {
    const mark = await this.findMark(id);
    const day = fromDbDate(mark.day);
    const { today } = await this.checkDay(day);
    await this.prisma.habitMark.delete({ where: { id } });
    await this.reclose(day, today);
    return this.report(day);
  }

  async skipDay(day: string, skipped: boolean, reason?: string): Promise<DayReport> {
    const { today } = await this.checkDay(day);
    await this.ensureThrough();
    await this.load(day);
    await this.prisma.habitDay.update({
      where: { day: toDbDate(day) },
      data: { skipped, skippedReason: skipped ? reason || null : null },
    });
    await this.reclose(day, today);
    await this.changed();
    return this.report(day);
  }

  async skipItem(day: string, itemId: string, skipped: boolean): Promise<DayReport> {
    const { today } = await this.checkDay(day);
    await this.ensureThrough();
    const row = await this.load(day);
    const item = row.items.find((candidate) => candidate.itemId === itemId);
    if (!item) throw new NotFoundException('That item is not on this day');
    await this.prisma.habitDayItem.update({ where: { id: item.id }, data: { skipped } });
    await this.reclose(day, today);
    await this.changed();
    return this.report(day);
  }
}

function parseDay(day: string): string {
  const parsed = daySchema.safeParse(day);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]!.message);
  return parsed.data;
}

@Controller('habits')
export class DaysController {
  constructor(private readonly days: DaysService) {}

  @Get('days/:day')
  report(@Param('day') day: string): Promise<DayReport> {
    return this.days.report(parseDay(day));
  }

  @Post('days/:day/marks')
  mark(
    @Param('day') day: string,
    @Body(new ZodValidationPipe(markSchema)) body: z.infer<typeof markSchema>,
  ): Promise<DayReport> {
    return this.days.addMark(parseDay(day), body.itemId, body.at);
  }

  @Patch('marks/:id')
  move(@Param('id') id: string, @Body(new ZodValidationPipe(moveSchema)) body: z.infer<typeof moveSchema>): Promise<DayReport> {
    return this.days.moveMark(id, body.at);
  }

  @Delete('marks/:id')
  @HttpCode(200)
  unmark(@Param('id') id: string): Promise<DayReport> {
    return this.days.removeMark(id);
  }

  @Put('days/:day/skip')
  skip(
    @Param('day') day: string,
    @Body(new ZodValidationPipe(skipSchema)) body: z.infer<typeof skipSchema>,
  ): Promise<DayReport> {
    return this.days.skipDay(parseDay(day), true, body.reason);
  }

  @Delete('days/:day/skip')
  @HttpCode(200)
  unskip(@Param('day') day: string): Promise<DayReport> {
    return this.days.skipDay(parseDay(day), false);
  }

  @Put('days/:day/items/:itemId/skip')
  skipItem(@Param('day') day: string, @Param('itemId') itemId: string): Promise<DayReport> {
    return this.days.skipItem(parseDay(day), itemId, true);
  }

  @Delete('days/:day/items/:itemId/skip')
  @HttpCode(200)
  unskipItem(@Param('day') day: string, @Param('itemId') itemId: string): Promise<DayReport> {
    return this.days.skipItem(parseDay(day), itemId, false);
  }
}
