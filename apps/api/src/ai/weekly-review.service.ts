import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Channel } from '@pa/shared';
import { DateTime } from 'luxon';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService } from '../reminders/reminder-engine.service';
import { SettingsService } from '../settings/settings.service';
import { AiKeyService } from './ai-key.service';
import { AiService } from './ai.service';
import { weeklyMessages } from './prompts';
import { SnapshotService } from './snapshots';

/** A settings-table row that remembers the day the review last went out. It is not one of the settings the app lists. */
const SENT_ROW = 'ai.weeklyReview.sent';
/** The review goes out any time in the hour after the chosen time, so a restart at that moment does not lose it. */
const WINDOW_MINUTES = 60;

/** The weekly note on money and habits: written by the assistant and sent through the reminder channels. */
@Injectable()
export class WeeklyReviewService {
  private readonly logger = new Logger(WeeklyReviewService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly snapshots: SnapshotService,
    private readonly ai: AiService,
    private readonly keys: AiKeyService,
    private readonly engine: ReminderEngineService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Writes this week's review. Throws if the assistant is not set up or cannot be reached. */
  async compose(): Promise<string> {
    const { today, symbol } = await this.snapshots.today();
    return this.ai.text(weeklyMessages(await this.snapshots.week(), today, symbol), { maxTokens: 450 });
  }

  /** Sends text as a reminder on the given channels, right now. */
  async deliver(text: string, channels: Channel[]): Promise<void> {
    const now = new Date();
    await this.engine.create(
      { ownerType: 'system', title: 'Your week', body: text, url: '/today', schedule: { kind: 'once', at: now.toISOString() }, channels },
      now,
    );
    await this.engine.tick(now);
  }

  /** Writes and sends a review immediately, whatever day it is. */
  async sendNow(): Promise<string> {
    const text = await this.compose();
    await this.deliver(text, (await this.settings.get('ai.weeklyReview')).channels);
    return text;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    // Tests call the pieces directly.
    if (this.env.NODE_ENV === 'test' || this.running) return;
    this.running = true;
    try {
      const plan = await this.settings.get('ai.weeklyReview');
      if (!plan.enabled || !(await this.keys.status()).enabled) return;

      const timeZone = await this.settings.get('general.timezone');
      const local = DateTime.now().setZone(timeZone);
      // Luxon counts Monday as 1 and Sunday as 7; the setting counts Sunday as 0.
      if (local.weekday % 7 !== plan.day) return;
      const [hour = 20, minute = 0] = plan.time.split(':').map(Number);
      const start = local.set({ hour, minute, second: 0, millisecond: 0 });
      if (local < start || local >= start.plus({ minutes: WINDOW_MINUTES })) return;

      const today = local.toISODate();
      if (!today) return;
      const sent = await this.prisma.setting.findUnique({ where: { key: SENT_ROW } });
      if (sent?.value === today) return;
      // Claimed before the (paid) call, so a slow run or a restart cannot send it twice.
      await this.prisma.setting.upsert({ where: { key: SENT_ROW }, create: { key: SENT_ROW, value: today }, update: { value: today } });

      await this.deliver(await this.compose(), plan.channels);
    } catch (error) {
      this.logger.error(`Weekly review failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
