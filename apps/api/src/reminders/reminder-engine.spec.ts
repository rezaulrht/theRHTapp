import type { INestApplication } from '@nestjs/common';
import type { Channel } from '@pa/shared';
import { createTestApp, resetDb } from '../../test/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CHANNEL_SENDERS, type ChannelSender, type ReminderMessage } from './channel-sender';
import { type ReminderInput, ReminderEngineService } from './reminder-engine.service';

class FakeSender implements ChannelSender {
  calls: ReminderMessage[] = [];
  failWith: string | null = null;
  constructor(readonly channel: Channel) {}
  async send(message: ReminderMessage): Promise<void> {
    this.calls.push(message);
    if (this.failWith) throw new Error(this.failWith);
  }
}

// 10:00 on Friday 13 November 2026 in Dhaka (UTC+6).
const NOW = new Date('2026-11-13T04:00:00Z');
const minutes = (n: number) => n * 60_000;
const at = (base: Date, offsetMs: number) => new Date(base.getTime() + offsetMs);

describe('ReminderEngineService', () => {
  let app: INestApplication;
  let engine: ReminderEngineService;
  let prisma: PrismaService;
  const push = new FakeSender('push');
  const email = new FakeSender('email');

  const base: ReminderInput = {
    ownerType: 'system',
    title: 'Drink water',
    body: 'A glass now.',
    url: '/habits',
    schedule: { kind: 'once', at: NOW.toISOString() },
    channels: ['push', 'email'],
  };
  const deliveries = () =>
    prisma.reminderDelivery.findMany({ orderBy: [{ occurrenceAt: 'asc' }, { channel: 'asc' }] });

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(CHANNEL_SENDERS).useValue([push, email]),
    );
    engine = app.get(ReminderEngineService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    for (const sender of [push, email]) {
      sender.calls = [];
      sender.failWith = null;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends a due reminder on every channel and records each delivery', async () => {
    const reminder = await engine.create(base, NOW);
    await engine.tick(NOW);

    expect(push.calls).toEqual([{ title: 'Drink water', body: 'A glass now.', url: '/habits' }]);
    expect(email.calls).toHaveLength(1);
    expect((await deliveries()).map((d) => [d.channel, d.status])).toEqual([
      ['email', 'sent'],
      ['push', 'sent'],
    ]);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(after.nextFireAt).toBeNull();
  });

  it('does not fire before the reminder is due', async () => {
    await engine.create({ ...base, schedule: { kind: 'once', at: at(NOW, minutes(5)).toISOString() } }, NOW);
    await engine.tick(NOW);
    expect(push.calls).toHaveLength(0);
  });

  it('does not send the same occurrence twice across ticks', async () => {
    await engine.create(base, NOW);
    await engine.tick(NOW);
    await engine.tick(NOW);
    expect(push.calls).toHaveLength(1);
    expect(email.calls).toHaveLength(1);
  });

  it('does not send twice when two ticks overlap', async () => {
    await engine.create(base, NOW);
    await Promise.all([engine.tick(NOW), engine.tick(NOW)]);
    expect(push.calls).toHaveLength(1);
    expect(email.calls).toHaveLength(1);
    expect(await deliveries()).toHaveLength(2);
  });

  it('records an occurrence more than 30 minutes old as missed without sending', async () => {
    await engine.create(base, NOW);
    await engine.tick(at(NOW, minutes(31)));
    expect(push.calls).toHaveLength(0);
    expect((await deliveries()).map((d) => d.status)).toEqual(['missed', 'missed']);
  });

  it('still sends an occurrence 29 minutes old', async () => {
    await engine.create(base, NOW);
    await engine.tick(at(NOW, minutes(29)));
    expect(push.calls).toHaveLength(1);
  });

  describe('quiet hours', () => {
    const midnight = new Date('2026-11-13T18:00:00Z'); // 00:00 Saturday in Dhaka

    beforeEach(async () => {
      await app
        .get(SettingsService)
        .patch({ 'general.quietHours': { enabled: true, start: '23:30', end: '05:00' } });
    });

    it('suppresses a reminder that falls inside them', async () => {
      await engine.create({ ...base, schedule: { kind: 'once', at: midnight.toISOString() } }, NOW);
      await engine.tick(at(midnight, minutes(1)));
      expect(push.calls).toHaveLength(0);
      expect((await deliveries()).map((d) => d.status)).toEqual(['suppressed', 'suppressed']);
    });

    it('sends a reminder marked to ignore them', async () => {
      await engine.create(
        { ...base, ignoreQuietHours: true, schedule: { kind: 'once', at: midnight.toISOString() } },
        NOW,
      );
      await engine.tick(at(midnight, minutes(1)));
      expect(push.calls).toHaveLength(1);
    });
  });

  it('records a failed channel, still sends the other, advances, and carries on to other reminders', async () => {
    email.failWith = 'Mail service is down';
    // Every day at 10:00 Dhaka; created just before so the first occurrence is NOW.
    const weekly = await engine.create(
      { ...base, schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '10:00' } },
      at(NOW, -minutes(1)),
    );
    await engine.create({ ...base, title: 'Second', channels: ['push'] }, NOW);

    await engine.tick(NOW);

    const rows = await deliveries();
    const emailRow = rows.find((d) => d.channel === 'email')!;
    expect(emailRow.status).toBe('failed');
    expect(emailRow.error).toBe('Mail service is down');
    expect(rows.filter((d) => d.channel === 'push').map((d) => d.status)).toEqual(['sent', 'sent']);
    expect(push.calls.map((c) => c.title).sort()).toEqual(['Drink water', 'Second']);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: weekly.id } });
    expect(after.nextFireAt).toEqual(at(NOW, minutes(24 * 60)));
  });

  it('after days of downtime, marks skipped occurrences missed and lands on a future time', async () => {
    const weekly = await engine.create(
      { ...base, channels: ['push'], schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '10:00' } },
      at(NOW, -minutes(1)),
    );
    const later = at(NOW, minutes(3 * 24 * 60 + 120)); // three days and two hours on
    await engine.tick(later);

    expect(push.calls).toHaveLength(0);
    expect((await deliveries()).map((d) => d.status)).toEqual(['missed', 'missed', 'missed', 'missed']);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: weekly.id } });
    expect(after.nextFireAt).toEqual(at(NOW, minutes(4 * 24 * 60)));
  });

  it('after a short gap, sends only the latest occurrence of a repeating reminder', async () => {
    await engine.create(
      {
        ...base,
        channels: ['push'],
        schedule: { kind: 'interval', days: [5], start: '10:00', end: '12:00', everyMinutes: 5 },
      },
      at(NOW, -minutes(1)),
    );
    await engine.tick(at(NOW, minutes(12))); // 10:00, 10:05 and 10:10 are all due
    expect(push.calls).toHaveLength(1);
    expect((await deliveries()).map((d) => d.status)).toEqual(['missed', 'missed', 'sent']);
  });

  it('rejects a schedule with no days', async () => {
    await expect(
      engine.create({ ...base, schedule: { kind: 'weekly', days: [], time: '10:00' } }, NOW),
    ).rejects.toThrow();
  });

  it('rejects a reminder with no title', async () => {
    await expect(engine.create({ ...base, title: '' }, NOW)).rejects.toThrow();
  });

  it('never fires a disabled reminder', async () => {
    await engine.create({ ...base, enabled: false }, NOW);
    await engine.tick(NOW);
    expect(push.calls).toHaveLength(0);
    expect(await deliveries()).toHaveLength(0);
  });

  it('update recomputes when the reminder is next due', async () => {
    const reminder = await engine.create(
      { ...base, schedule: { kind: 'weekly', days: [5], time: '11:00' } },
      NOW,
    );
    expect(reminder.nextFireAt).toEqual(new Date('2026-11-13T05:00:00Z'));
    const updated = await engine.update(
      reminder.id,
      { schedule: { kind: 'weekly', days: [5], time: '12:30' } },
      NOW,
    );
    expect(updated.nextFireAt).toEqual(new Date('2026-11-13T06:30:00Z'));
    const disabled = await engine.update(reminder.id, { enabled: false }, NOW);
    expect(disabled.nextFireAt).toBeNull();
  });

  it('removeForOwner deletes only that owner’s reminders', async () => {
    await engine.create({ ...base, ownerType: 'habit', ownerId: 'a' }, NOW);
    await engine.create({ ...base, ownerType: 'habit', ownerId: 'b' }, NOW);
    await engine.create({ ...base, ownerType: 'vault', ownerId: 'a' }, NOW);
    await engine.removeForOwner('habit', 'a');
    const left = await prisma.reminder.findMany({ orderBy: { ownerType: 'asc' } });
    expect(left.map((r) => [r.ownerType, r.ownerId])).toEqual([
      ['habit', 'b'],
      ['vault', 'a'],
    ]);
  });

  it('a channel with no sender is recorded as failed', async () => {
    const lonely = await createTestApp((builder) =>
      builder.overrideProvider(CHANNEL_SENDERS).useValue([push]),
    );
    try {
      await lonely.get(ReminderEngineService).create(base, NOW);
      await lonely.get(ReminderEngineService).tick(NOW);
      const rows = await lonely
        .get(PrismaService)
        .reminderDelivery.findMany({ orderBy: { channel: 'asc' } });
      expect(rows.map((d) => [d.channel, d.status])).toEqual([
        ['email', 'failed'],
        ['push', 'sent'],
      ]);
    } finally {
      await lonely.close();
    }
  });
});
