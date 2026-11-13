import { z } from 'zod';
import { timeOfDaySchema } from './settings';

export const CHANNELS = ['push', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];
export const channelSchema = z.enum(CHANNELS);

/** Days of the week a schedule applies to: 0 = Sunday … 6 = Saturday. */
const daysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Pick at least one day')
  .refine((days) => new Set(days).size === days.length, 'A day is listed twice');

export type Schedule =
  /** Fires once at an exact instant (ISO 8601, UTC). */
  | { kind: 'once'; at: string }
  /** Fires at `time` (in the settings time zone) on each of `days`, shifted by `offsetMinutes`. */
  | { kind: 'weekly'; days: number[]; time: string; offsetMinutes?: number }
  /** Fires every `everyMinutes` from `start` to `end` inclusive on each of `days`. */
  | { kind: 'interval'; days: number[]; start: string; end: string; everyMinutes: number };

export const scheduleSchema: z.ZodType<Schedule> = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('once'),
      at: z.iso.datetime({ offset: true }),
    }),
    z.object({
      kind: z.literal('weekly'),
      days: daysSchema,
      time: timeOfDaySchema,
      offsetMinutes: z.number().int().min(-1440).max(1440).optional(),
    }),
    z.object({
      kind: z.literal('interval'),
      days: daysSchema,
      start: timeOfDaySchema,
      end: timeOfDaySchema,
      everyMinutes: z.number().int().min(5, 'Repeat every 5 minutes or more').max(1440),
    }),
  ])
  .superRefine((schedule, ctx) => {
    if (schedule.kind === 'interval' && schedule.end <= schedule.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must be later than start' });
    }
  });
