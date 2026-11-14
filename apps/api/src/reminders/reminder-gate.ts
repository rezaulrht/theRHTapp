import type { Reminder } from '@pa/db';

/**
 * A last-moment check on a section's reminders. Registered with
 * `ReminderEngineService.registerGate`. Answering false records the occurrence
 * as `skipped` and sends nothing: for example the daily "log your spending"
 * nudge on a day that already has entries.
 */
export interface ReminderGate {
  /** The reminders this gate decides for: those with this `ownerType`. */
  ownerType: string;
  shouldSend(reminder: Reminder, occurrenceAt: Date): Promise<boolean>;
}
