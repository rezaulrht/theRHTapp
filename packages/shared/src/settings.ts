import { IANAZone } from 'luxon';
import { z } from 'zod';

export const WEEK_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** A wall-clock time in the settings time zone, 24-hour `HH:mm`. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 05:30');

/** Ways a reminder can reach the owner. */
export const CHANNELS = ['push', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];
export const channelSchema = z.enum(CHANNELS);

const dayTypeSchema = z.object({
  id: z.string().min(1, 'A day type needs an id'),
  name: z.string().min(1, 'A day type needs a name'),
});

const weekPatternSchema = z.object({
  sun: z.string(),
  mon: z.string(),
  tue: z.string(),
  wed: z.string(),
  thu: z.string(),
  fri: z.string(),
  sat: z.string(),
});

export const settingsSchema = z
  .strictObject({
    'general.timezone': z
      .string()
      .refine((zone) => IANAZone.isValidZone(zone), 'Unknown time zone'),
    'general.location': z.object({
      label: z.string(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
    'general.currency': z.object({
      symbol: z.string().min(1),
      code: z.string().min(1),
    }),
    'general.dayTypes': z.array(dayTypeSchema).min(1, 'Keep at least one day type'),
    'general.weekPattern': weekPatternSchema,
    'general.notificationEmail': z.union([z.literal(''), z.email('Enter a valid email address')]),
    'general.quietHours': z.object({
      enabled: z.boolean(),
      start: timeOfDaySchema,
      end: timeOfDaySchema,
    }),
    /** Warn when spending reaches this percentage of a budget. */
    'money.budgetWarnPercent': z.number().int().min(1).max(100),
    /** The daily nudge to log spending. */
    'money.dailyReminder': z.object({
      enabled: z.boolean(),
      time: timeOfDaySchema,
      channels: z.array(channelSchema),
      /** Do not send it on a day that already has an entry. */
      skipIfLogged: z.boolean(),
    }),
  })
  .superRefine((settings, ctx) => {
    const ids = settings['general.dayTypes'].map((d) => d.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['general.dayTypes'],
        message: 'Day type ids must be unique',
      });
    }
    for (const day of WEEK_DAYS) {
      const dayType = settings['general.weekPattern'][day];
      if (!ids.includes(dayType)) {
        ctx.addIssue({
          code: 'custom',
          path: ['general.weekPattern', day],
          message: `"${dayType}" is not one of your day types`,
        });
      }
    }
  });

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsKey = keyof Settings;

export const defaultSettings: Settings = {
  'general.timezone': 'Asia/Dhaka',
  'general.location': { label: 'Dhaka', lat: 23.8103, lng: 90.4125 },
  'general.currency': { symbol: '৳', code: 'BDT' },
  'general.dayTypes': [
    { id: 'workday', name: 'Workday' },
    { id: 'classday', name: 'Class day' },
  ],
  'general.weekPattern': {
    sun: 'workday',
    mon: 'workday',
    tue: 'workday',
    wed: 'workday',
    thu: 'workday',
    fri: 'classday',
    sat: 'workday',
  },
  'general.notificationEmail': '',
  'general.quietHours': { enabled: false, start: '23:30', end: '05:00' },
  'money.budgetWarnPercent': 80,
  'money.dailyReminder': { enabled: true, time: '21:00', channels: ['push'], skipIfLogged: true },
};

export interface SettingsError {
  path: string;
  message: string;
}

export type SettingsPatchResult =
  | { ok: true; value: Settings }
  | { ok: false; errors: SettingsError[] };

/**
 * Lays `patch` over `current` and validates the whole result, so rules that
 * span several settings (a week pattern naming a day type) are always checked.
 */
export function parseSettingsPatch(current: Settings, patch: unknown): SettingsPatchResult {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, errors: [{ path: '', message: 'Send the settings to change as an object' }] };
  }

  const result = settingsSchema.safeParse({ ...current, ...patch });
  if (result.success) return { ok: true, value: result.data };

  const errors: SettingsError[] = [];
  for (const issue of result.error.issues) {
    const base = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        errors.push({ path: [...base, key].join('.'), message: 'Unknown setting' });
      }
    } else {
      errors.push({ path: base.join('.'), message: issue.message });
    }
  }
  return { ok: false, errors };
}
