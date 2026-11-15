import type { PrismaClient } from '@pa/db';
import type { AppliesTo, Timing } from '@pa/shared';
import type { ItemReminders } from './common';

const EVERY_DAY: AppliesTo = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };
const POINTS = 500;

const atOpen: ItemReminders = { channels: ['push'], onOpen: true, onDue: false, warn: true };
const atDue: ItemReminders = { channels: ['push'], onOpen: false, onDue: true, warn: true };
const quiet: ItemReminders = { channels: ['push'], onOpen: false, onDue: false, warn: false };

interface Starter {
  name: string;
  timing: Timing;
  reminders: ItemReminders;
  ignoreQuietHours?: boolean;
}

/** The routine the owner described. Every row is theirs to change or remove. */
export const STARTING_ROUTINE: Starter[] = [
  // The wake-up call must come through even if quiet hours run past it.
  { name: 'Wake up', timing: { kind: 'fixed', due: '05:30' }, reminders: atDue, ignoreQuietHours: true },
  { name: 'Fajr', timing: { kind: 'prayer', prayer: 'fajr' }, reminders: atOpen, ignoreQuietHours: true },
  { name: 'Gym', timing: { kind: 'fixed', due: '07:30' }, reminders: atDue },
  { name: 'Breakfast', timing: { kind: 'fixed', due: '08:30' }, reminders: atDue },
  { name: 'Snack', timing: { kind: 'fixed', start: '11:00', due: '11:30' }, reminders: atOpen },
  { name: 'Zuhr', timing: { kind: 'prayer', prayer: 'zuhr', start: '13:00', end: '13:30' }, reminders: atOpen },
  { name: 'Lunch', timing: { kind: 'fixed', start: '13:30', due: '14:00' }, reminders: atOpen },
  { name: 'Walk after lunch', timing: { kind: 'fixed', start: '14:00', due: '14:30' }, reminders: atOpen },
  { name: 'Asr', timing: { kind: 'prayer', prayer: 'asr' }, reminders: atOpen },
  { name: 'Maghrib', timing: { kind: 'prayer', prayer: 'maghrib' }, reminders: atOpen },
  { name: 'Dinner', timing: { kind: 'fixed', due: '20:00' }, reminders: atDue },
  { name: 'Isha', timing: { kind: 'prayer', prayer: 'isha' }, reminders: atOpen },
  { name: 'Study or office work', timing: { kind: 'fixed', due: '22:30' }, reminders: atDue },
  { name: 'Brush teeth', timing: { kind: 'fixed' }, reminders: quiet },
  { name: 'Sleep', timing: { kind: 'fixed', due: '23:30' }, reminders: atDue },
  {
    name: 'Drink water',
    timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 },
    // Notification only: an email every 90 minutes would flood the inbox.
    reminders: quiet,
  },
];

/**
 * Gives a brand-new installation the starting routine. It does nothing once
 * any item has ever existed, removed ones included, so it never brings back
 * something the owner took off.
 */
export async function ensureHabitSeed(prisma: PrismaClient): Promise<void> {
  if ((await prisma.habitItem.count()) > 0) return;
  await prisma.habitItem.createMany({
    data: STARTING_ROUTINE.map((starter, sortOrder) => ({
      name: starter.name,
      points: POINTS,
      timing: starter.timing,
      appliesTo: EVERY_DAY,
      reminders: starter.reminders,
      ignoreQuietHours: starter.ignoreQuietHours ?? false,
      sortOrder,
    })),
  });
}
