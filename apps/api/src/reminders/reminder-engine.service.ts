import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, Reminder } from '@pa/db';
import {
  type Channel,
  channelSchema,
  isInQuietHours,
  nextOccurrence,
  type Schedule,
  scheduleSchema,
  type Settings,
} from '@pa/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CHANNEL_SENDERS, type ChannelSender } from './channel-sender';
import type { ReminderGate } from './reminder-gate';

/** An occurrence older than this when the engine gets to it is not sent. */
export const MISSED_AFTER_MS = 30 * 60_000;
/** Upper bound on occurrences caught up for one reminder in one tick. */
const MAX_CATCH_UP = 500;
const INTERRUPTED = 'Interrupted before sending finished';

const reminderInputSchema = z.object({
  ownerType: z.enum(['system', 'money', 'habit', 'vault']),
  ownerId: z.string().min(1).optional(),
  title: z.string().min(1, 'A reminder needs a title'),
  body: z.string(),
  url: z.string().startsWith('/', 'Use a path inside the app, starting with /'),
  schedule: scheduleSchema,
  channels: z.array(channelSchema),
  ignoreQuietHours: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export interface ReminderInput {
  ownerType: 'system' | 'money' | 'habit' | 'vault';
  ownerId?: string;
  title: string;
  body: string;
  url: string;
  schedule: Schedule;
  /** May be empty: the reminder then only shows inside the app. */
  channels: Channel[];
  ignoreQuietHours?: boolean;
  enabled?: boolean;
}

type Outcome = 'send' | 'missed' | 'suppressed';

function parseInput(input: unknown): ReminderInput {
  const result = reminderInputSchema.safeParse(input);
  if (result.success) return result.data;
  throw new BadRequestException({
    message: 'This reminder is not valid',
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

function firstFireAt(schedule: Schedule, enabled: boolean, now: Date, timeZone: string): Date | null {
  if (!enabled) return null;
  // A one-off keeps its own time even if that is this very instant or just
  // past; the tick decides whether it is still worth sending.
  if (schedule.kind === 'once') return new Date(schedule.at);
  return nextOccurrence(schedule, now, timeZone);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class ReminderEngineService {
  private readonly logger = new Logger(ReminderEngineService.name);
  private readonly gates: ReminderGate[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(CHANNEL_SENDERS) private readonly senders: ChannelSender[],
  ) {}

  /**
   * Lets a section decide, at the moment of sending, that one of its reminders
   * is no longer needed. Such an occurrence is recorded as `skipped`.
   */
  registerGate(gate: ReminderGate): void {
    this.gates.push(gate);
  }

  private async wanted(reminder: Reminder, occurrenceAt: Date): Promise<boolean> {
    const gate = this.gates.find((candidate) => candidate.ownerType === reminder.ownerType);
    if (!gate) return true;
    try {
      return await gate.shouldSend(reminder, occurrenceAt);
    } catch (error) {
      // If the check itself breaks, sending is the safer mistake.
      this.logger.error(`Reminder gate for ${reminder.ownerType} failed: ${String(error)}`);
      return true;
    }
  }

  async create(input: ReminderInput, now = new Date()): Promise<Reminder> {
    const data = parseInput(input);
    const timeZone = await this.settings.get('general.timezone');
    const enabled = data.enabled ?? true;
    return this.prisma.reminder.create({
      data: {
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        title: data.title,
        body: data.body,
        url: data.url,
        schedule: data.schedule as unknown as Prisma.InputJsonValue,
        channels: data.channels,
        ignoreQuietHours: data.ignoreQuietHours ?? false,
        enabled,
        nextFireAt: firstFireAt(data.schedule, enabled, now, timeZone),
      },
    });
  }

  async update(id: string, input: Partial<ReminderInput>, now = new Date()): Promise<Reminder> {
    const existing = await this.prisma.reminder.findUniqueOrThrow({ where: { id } });
    const data = parseInput({
      ownerType: existing.ownerType,
      ownerId: existing.ownerId ?? undefined,
      title: existing.title,
      body: existing.body,
      url: existing.url,
      schedule: existing.schedule,
      channels: existing.channels,
      ignoreQuietHours: existing.ignoreQuietHours,
      enabled: existing.enabled,
      ...input,
    });
    const enabled = data.enabled ?? true;
    const reschedule = input.schedule !== undefined || input.enabled !== undefined;
    const timeZone = await this.settings.get('general.timezone');
    return this.prisma.reminder.update({
      where: { id },
      data: {
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        title: data.title,
        body: data.body,
        url: data.url,
        schedule: data.schedule as unknown as Prisma.InputJsonValue,
        channels: data.channels,
        ignoreQuietHours: data.ignoreQuietHours ?? false,
        enabled,
        ...(reschedule ? { nextFireAt: firstFireAt(data.schedule, enabled, now, timeZone) } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.reminder.deleteMany({ where: { id } });
  }

  async removeForOwner(ownerType: string, ownerId: string): Promise<void> {
    await this.prisma.reminder.deleteMany({ where: { ownerType, ownerId } });
  }

  /**
   * Sends every reminder that is due at `now`. Safe to call again for the same
   * moment, or from two places at once: each occurrence is claimed in the
   * database before it is sent.
   */
  async tick(now: Date): Promise<void> {
    const settings = await this.settings.getAll();
    const due = await this.prisma.reminder.findMany({
      where: { enabled: true, nextFireAt: { lte: now } },
      orderBy: { nextFireAt: 'asc' },
    });
    for (const reminder of due) {
      try {
        await this.fire(reminder, now, settings);
      } catch (error) {
        // One broken reminder must not hold up the rest.
        this.logger.error(`Reminder ${reminder.id} failed: ${String(error)}`);
      }
    }
  }

  private async fire(reminder: Reminder, now: Date, settings: Settings): Promise<void> {
    const parsed = scheduleSchema.safeParse(reminder.schedule);
    if (!parsed.success || !reminder.nextFireAt) {
      await this.prisma.reminder.updateMany({
        where: { id: reminder.id },
        data: { enabled: false, nextFireAt: null },
      });
      this.logger.error(`Reminder ${reminder.id} has an unreadable schedule and was switched off`);
      return;
    }
    const schedule = parsed.data;
    const timeZone = settings['general.timezone'];

    // Every occurrence up to now, oldest first. After downtime there can be several.
    const occurrences: Date[] = [];
    let next: Date | null = reminder.nextFireAt;
    while (next && next.getTime() <= now.getTime() && occurrences.length < MAX_CATCH_UP) {
      occurrences.push(next);
      next = nextOccurrence(schedule, next, timeZone);
    }
    if (next && next.getTime() <= now.getTime()) next = nextOccurrence(schedule, now, timeZone);

    const latest = occurrences[occurrences.length - 1];
    for (const occurrence of occurrences) {
      let outcome: Outcome = 'missed';
      if (occurrence === latest && now.getTime() - occurrence.getTime() <= MISSED_AFTER_MS) {
        const quiet =
          !reminder.ignoreQuietHours &&
          isInQuietHours(occurrence, settings['general.quietHours'], timeZone);
        outcome = quiet ? 'suppressed' : 'send';
      }
      for (const channel of reminder.channels) {
        await this.deliver(reminder, occurrence, channel, outcome);
      }
    }

    await this.prisma.reminder.updateMany({
      where: { id: reminder.id },
      data: { nextFireAt: next },
    });
  }

  private async deliver(
    reminder: Reminder,
    occurrenceAt: Date,
    channel: string,
    outcome: Outcome,
  ): Promise<void> {
    // Claim the occurrence first. The unique key on (reminder, occurrence,
    // channel) means only one caller ever gets past this line for it.
    let deliveryId: string;
    try {
      const row = await this.prisma.reminderDelivery.create({
        data: {
          reminderId: reminder.id,
          occurrenceAt,
          channel,
          status: outcome === 'send' ? 'failed' : outcome,
          error: outcome === 'send' ? INTERRUPTED : null,
        },
      });
      deliveryId = row.id;
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
    if (outcome !== 'send') return;

    if (!(await this.wanted(reminder, occurrenceAt))) {
      await this.prisma.reminderDelivery.update({
        where: { id: deliveryId },
        data: { status: 'skipped', error: null },
      });
      return;
    }

    let status = 'sent';
    let errorText: string | null = null;
    try {
      const sender = this.senders.find((s) => s.channel === channel);
      if (!sender) throw new Error(`No sender is set up for ${channel}`);
      await sender.send({ title: reminder.title, body: reminder.body, url: reminder.url });
    } catch (error) {
      status = 'failed';
      errorText = error instanceof Error ? error.message : String(error);
    }
    await this.prisma.reminderDelivery.update({
      where: { id: deliveryId },
      data: { status, error: errorText },
    });
  }
}
