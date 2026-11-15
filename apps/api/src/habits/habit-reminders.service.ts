import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Reminder } from '@pa/db';
import { habitDayOf, nudgeTimes, resolveTime, type Settings, type Timing } from '@pa/shared';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService, type ReminderInput } from '../reminders/reminder-engine.service';
import type { ReminderGate } from '../reminders/reminder-gate';
import { SettingsService } from '../settings/settings.service';
import type { ItemReminders } from './common';
import { DaysService, type DayItemJson, type DayReport } from './days';
import { ItemsService } from './items';
import { prayerTimesFor } from './prayer-times';

const SUMMARY = 'summary';
const URL = '/habits';
/** Sent reminders are kept this long so the delivery history can show them. */
const KEEP_SENT_MS = 14 * 86_400_000;

/** Hundredths of a point as the owner reads them: 250 is "2.5", -750 is "−7.5". */
export function pointsText(hundredths: number): string {
  const text = (Math.abs(hundredths) / 100).toFixed(2).replace(/\.?0+$/, '');
  return hundredths < 0 ? `−${text}` : text;
}

/** The end-of-day message: the score, and what cost the most. */
export function summaryBody(report: DayReport): string {
  if (report.skipped) return 'Today was skipped.';
  const losses = report.items
    .filter((item) => item.outcome === 'late' || item.outcome === 'missed')
    .map((item) => ({ name: item.name, lost: item.points - item.score }))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 3);
  const score = `Score ${pointsText(report.score)} of ${pointsText(report.possible)}.`;
  if (losses.length === 0) return `${score} Nothing lost today.`;
  return `${score} Lost most: ${losses.map((loss) => `${loss.name} (${pointsText(-loss.lost)})`).join(', ')}.`;
}

/** Whether an item has a real deadline, rather than simply "before the day ends". */
function hasDeadline(timing: Timing): boolean {
  if (timing.kind === 'fixed') return timing.due !== undefined;
  if (timing.kind === 'prayer') return timing.prayer !== 'isha' || timing.end !== undefined;
  return false;
}

/**
 * Habit reminders. Prayer times move a little every day, so reminders are not
 * standing schedules: each habit day is planned as a set of one-off reminders,
 * and planned again whenever the routine, a skip or a setting changes. A gate
 * drops any whose item has been ticked or skipped by the time it is due.
 */
@Injectable()
export class HabitRemindersService implements OnModuleInit, ReminderGate {
  readonly ownerType = 'habit';
  private readonly logger = new Logger(HabitRemindersService.name);
  private plannedDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: ReminderEngineService,
    private readonly days: DaysService,
    private readonly items: ItemsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.engine.registerGate(this);
    // Fires when the routine or a habit setting changes, and on every skip.
    this.days.onChanged(() => this.plan());
  }

  /** Plans the new day when the habit day turns over, and once after start-up. */
  @Cron(CronExpression.EVERY_MINUTE)
  async rollover(): Promise<void> {
    // Tests plan exactly when they mean to.
    if (this.env.NODE_ENV === 'test') return;
    try {
      const today = await this.days.today();
      if (today !== this.plannedDay) await this.plan();
    } catch (error) {
      this.logger.error(`Planning habit reminders failed: ${String(error)}`);
    }
  }

  /** Replaces every pending habit reminder with the ones today still needs. */
  async plan(): Promise<void> {
    const now = this.days.clock();
    const settings = await this.settings.getAll();
    const today = habitDayOf(now, settings['general.timezone'], settings['habits.dayEndHour']);

    await this.prisma.reminder.deleteMany({
      where: {
        ownerType: 'habit',
        OR: [{ nextFireAt: { not: null } }, { updatedAt: { lt: new Date(now.getTime() - KEEP_SENT_MS) } }],
      },
    });
    this.plannedDay = today;

    const report = await this.days.report(today);
    const inputs: ReminderInput[] = [];
    if (!report.skipped) {
      const routine = new Map((await this.items.rows()).map((item) => [item.id, item]));
      for (const item of report.items) {
        const source = routine.get(item.itemId);
        if (!source || item.skipped) continue;
        const reminders = source.reminders as unknown as ItemReminders;
        if (reminders.channels.length === 0) continue;
        for (const moment of this.moments(item, reminders, today, settings)) {
          inputs.push({
            ownerType: 'habit',
            ownerId: item.itemId,
            title: moment.title,
            body: moment.body,
            url: URL,
            schedule: { kind: 'once', at: moment.at.toISOString() },
            channels: reminders.channels,
            ignoreQuietHours: source.ignoreQuietHours,
          });
        }
      }
    }

    const summary = settings['habits.daySummary'];
    if (summary.enabled && summary.channels.length > 0 && !report.skipped && report.items.length > 0) {
      inputs.push({
        ownerType: 'habit',
        ownerId: SUMMARY,
        title: 'Your day',
        // Written when it is sent, from the day as it then stands.
        body: '',
        url: URL,
        schedule: {
          kind: 'once',
          at: resolveTime(today, summary.time, settings['general.timezone'], settings['habits.dayEndHour']).toISOString(),
        },
        channels: summary.channels,
      });
    }

    for (const input of inputs) {
      if (new Date((input.schedule as { at: string }).at).getTime() > now.getTime()) await this.engine.create(input, now);
    }
  }

  /** The instants an item asks to be reminded at, with what each says. */
  private moments(
    item: DayItemJson,
    reminders: ItemReminders,
    day: string,
    settings: Settings,
  ): { at: Date; title: string; body: string }[] {
    const tick = 'Open your routine to tick it off.';
    if (item.timing.kind === 'repeating') {
      const context = {
        timeZone: settings['general.timezone'],
        dayEndHour: settings['habits.dayEndHour'],
        prayers: prayerTimesFor(day, settings),
      };
      return nudgeTimes(item.timing, day, context).map((at) => ({ at, title: item.name, body: tick }));
    }

    const moments: { at: Date; title: string; body: string }[] = [];
    const due = new Date(item.dueAt);
    if (reminders.onOpen && item.opensAt) {
      moments.push({ at: new Date(item.opensAt), title: `Time for ${item.name}`, body: tick });
    }
    if (hasDeadline(item.timing)) {
      const lead = settings['habits.warnLeadMinutes'];
      const warnAt = new Date(due.getTime() - lead * 60_000);
      // A warning is pointless if it would come before the window has even opened.
      if (reminders.warn && (!item.opensAt || warnAt.getTime() > new Date(item.opensAt).getTime())) {
        moments.push({
          at: warnAt,
          title: `${item.name}: ${lead} ${lead === 1 ? 'minute' : 'minutes'} left`,
          body: tick,
        });
      }
      if (reminders.onDue) moments.push({ at: due, title: `${item.name} is due now`, body: tick });
    }
    return moments;
  }

  /** Nothing is sent for a thing already done or skipped. */
  async shouldSend(reminder: Reminder, occurrenceAt: Date): Promise<boolean> {
    const settings = await this.settings.getAll();
    const day = habitDayOf(occurrenceAt, settings['general.timezone'], settings['habits.dayEndHour']);
    const report = await this.days.report(day);

    if (reminder.ownerId === SUMMARY) {
      if (report.skipped || report.items.length === 0) return false;
      const body = summaryBody(report);
      await this.prisma.reminder.update({ where: { id: reminder.id }, data: { body } });
      // The engine sends from this same object, so the message goes out with the fresh words.
      reminder.body = body;
      return true;
    }

    const item = report.items.find((candidate) => candidate.itemId === reminder.ownerId);
    if (!item || item.skipped || report.skipped) return false;
    if (item.target !== null) return item.marks.length < item.target;
    return item.marks.length === 0;
  }
}
