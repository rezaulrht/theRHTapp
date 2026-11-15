import { channelSchema, PRAYERS, timeOfDaySchema, type AppliesTo, type Channel, type Timing } from '@pa/shared';
import { z } from 'zod';

export { assertFullOrder, daySchema, fieldError, fromDbDate, nameSchema, reorderSchema, toDbDate } from '../money/common';

/** The most an item can be worth: 1,000 points, in hundredths. */
export const MAX_POINTS = 100_000;

export const pointsSchema = z
  .number('Enter the points')
  .int('Points are whole hundredths')
  .min(1, 'Enter points above zero')
  .max(MAX_POINTS, 'That is too many points');

export const timingSchema: z.ZodType<Timing> = z
  .discriminatedUnion(
    'kind',
    [
      z.object({
        kind: z.literal('fixed'),
        start: timeOfDaySchema.optional(),
        due: timeOfDaySchema.optional(),
      }),
      z.object({
        kind: z.literal('prayer'),
        prayer: z.enum(PRAYERS, 'Pick a prayer'),
        start: timeOfDaySchema.optional(),
        end: timeOfDaySchema.optional(),
      }),
      z.object({
        kind: z.literal('repeating'),
        start: timeOfDaySchema,
        end: timeOfDaySchema,
        everyMinutes: z
          .number('Enter minutes')
          .int('Use whole minutes')
          .min(5, 'Repeat every 5 minutes or more')
          .max(720, 'Repeat at least twice a day'),
        target: z.number('Enter a number').int('Use a whole number').min(1, 'Aim for at least 1').max(100, 'Aim for 100 or fewer'),
      }),
    ],
    'Pick a kind of timing',
  )
  .superRefine((timing, ctx) => {
    // Times are compared as written. A window that runs past midnight is not offered.
    if (timing.kind === 'fixed' && timing.start && timing.due && timing.due <= timing.start) {
      ctx.addIssue({ code: 'custom', path: ['due'], message: 'The due time must be later than the start' });
    }
    if (timing.kind === 'prayer' && timing.start && timing.end && timing.end <= timing.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'The end must be later than the start' });
    }
    if (timing.kind === 'repeating' && timing.end <= timing.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'The end must be later than the start' });
    }
  });

export const appliesToSchema: z.ZodType<AppliesTo> = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('weekdays'),
      days: z
        .array(z.number().int().min(0).max(6))
        .min(1, 'Pick at least one day')
        .refine((days) => new Set(days).size === days.length, 'A day is listed twice'),
    }),
    z.object({
      kind: z.literal('dayTypes'),
      dayTypeIds: z.array(z.string().min(1)).min(1, 'Pick at least one kind of day'),
    }),
  ],
  'Pick which days it applies to',
);

// A type alias, not an interface, so it can be stored in a JSON column as it is.
export type ItemReminders = {
  channels: Channel[];
  /** When the window opens. */
  onOpen: boolean;
  /** At the due time. */
  onDue: boolean;
  /** A warning before the window closes. */
  warn: boolean;
};

export const remindersSchema: z.ZodType<ItemReminders> = z.object({
  channels: z.array(channelSchema),
  onOpen: z.boolean(),
  onDue: z.boolean(),
  warn: z.boolean(),
});

export const shareSchema = z.number('Enter a number').min(0, 'Use a share from 0 to 1').max(1, 'Use a share from 0 to 1');
export const multiplierSchema = z.number('Enter a number').min(0, 'Use a number from 0 to 5').max(5, 'Use a number from 0 to 5');
