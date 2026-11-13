import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService } from './reminder-engine.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface DeliveryResult {
  channel: string;
  status: string;
  error: string | null;
}

export interface DeliveryRecord extends DeliveryResult {
  id: string;
  title: string;
  occurrenceAt: Date;
  createdAt: Date;
}

@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly engine: ReminderEngineService,
    private readonly prisma: PrismaService,
  ) {}

  /** Sends a reminder right now on every channel and reports how each went. */
  @Post('test')
  @HttpCode(200)
  async sendTest(): Promise<{ deliveries: DeliveryResult[] }> {
    const now = new Date();
    const reminder = await this.engine.create(
      {
        ownerType: 'system',
        title: 'Test reminder',
        body: 'Reminders are working.',
        url: '/settings/notifications',
        schedule: { kind: 'once', at: now.toISOString() },
        channels: ['push', 'email'],
        ignoreQuietHours: true,
      },
      now,
    );
    await this.engine.tick(now);
    const deliveries = await this.prisma.reminderDelivery.findMany({
      where: { reminderId: reminder.id },
      orderBy: { channel: 'desc' },
      select: { channel: true, status: true, error: true },
    });
    return { deliveries };
  }

  @Get('deliveries')
  async deliveries(@Query('limit') limit?: string): Promise<DeliveryRecord[]> {
    const asked = Number.parseInt(limit ?? '', 10);
    const take = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;
    const rows = await this.prisma.reminderDelivery.findMany({
      orderBy: [{ occurrenceAt: 'desc' }, { createdAt: 'desc' }],
      take,
      include: { reminder: { select: { title: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.reminder.title,
      channel: row.channel,
      status: row.status,
      error: row.error,
      occurrenceAt: row.occurrenceAt,
      createdAt: row.createdAt,
    }));
  }
}
