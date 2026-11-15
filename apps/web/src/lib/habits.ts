import { api } from './api';

// Points cross the API as whole hundredths of a point. Only this file and the forms convert.

export type Prayer = 'fajr' | 'zuhr' | 'asr' | 'maghrib' | 'isha';
export type Timing =
  | { kind: 'fixed'; start?: string; due?: string }
  | { kind: 'prayer'; prayer: Prayer; start?: string; end?: string }
  | { kind: 'repeating'; start: string; end: string; everyMinutes: number; target: number };
export type AppliesTo = { kind: 'weekdays'; days: number[] } | { kind: 'dayTypes'; dayTypeIds: string[] };
export type Outcome = 'onTime' | 'late' | 'missed' | 'pending' | 'skipped';
export type Channel = 'push' | 'email';

export interface ItemReminders {
  channels: Channel[];
  onOpen: boolean;
  onDue: boolean;
  warn: boolean;
}

export interface HabitItem {
  id: string;
  name: string;
  points: number;
  timing: Timing;
  appliesTo: AppliesTo;
  lateShare: number | null;
  missMultiplier: number | null;
  reminders: ItemReminders;
  ignoreQuietHours: boolean;
  sortOrder: number;
  paused: boolean;
  archived: boolean;
}

export type HabitItemInput = Omit<HabitItem, 'id' | 'sortOrder' | 'paused' | 'archived'>;

export interface DayItem {
  itemId: string;
  name: string;
  points: number;
  timing: Timing;
  opensAt: string | null;
  dueAt: string;
  outcome: Outcome;
  score: number;
  skipped: boolean;
  marks: { id: string; at: string }[];
  target: number | null;
}

export interface PrayerTimes {
  fajr: string;
  sunrise: string;
  zuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface DayReport {
  day: string;
  isToday: boolean;
  closed: boolean;
  skipped: boolean;
  skippedReason: string | null;
  prayers: PrayerTimes;
  score: number;
  possible: number;
  lost: number;
  target: number;
  won: boolean | null;
  /** Null when it can be done any time before the day ends. */
  next: { itemId: string; name: string; at: string | null } | null;
  items: DayItem[];
}

export interface DayScore {
  day: string;
  score: number;
  possible: number;
  target: number;
  won: boolean | null;
  skipped: boolean;
}

export interface ItemStats {
  itemId: string;
  name: string;
  archived: boolean;
  lost: number;
  missed: number;
  late: number;
  onTime: number;
  applied: number;
  missRate: number;
  current: number;
  best: number;
}

export interface TodayHabitsReport {
  day: string;
  score: number;
  possible: number;
  target: number;
  won: boolean | null;
  next: DayReport['next'];
  done: number;
  total: number;
  skipped: boolean;
}

export type ParsedPoints = { ok: true; points: number } | { ok: false; message: string };

/** Reads points typed by hand ("5", "2.5") into hundredths. */
export function toPoints(input: string): ParsedPoints {
  const text = input.trim();
  if (text === '') return { ok: false, message: 'Enter the points' };
  if (!/^\d{0,4}(\.\d{0,2})?$/.test(text) || text === '.') return { ok: false, message: 'Use a number such as 5 or 2.5' };
  const [whole = '', fraction = ''] = text.split('.');
  const points = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (points < 1) return { ok: false, message: 'Enter points above zero' };
  if (points > 100_000) return { ok: false, message: 'That is too many points' };
  return { ok: true, points };
}

export function fromPoints(hundredths: number): number {
  return hundredths / 100;
}

/** Hundredths as they are read: 250 is "2.5", −750 is "−7.5", and "+5" when `signed`. */
export function pointsText(hundredths: number, signed = false): string {
  const text = (Math.abs(hundredths) / 100).toFixed(2).replace(/\.?0+$/, '');
  if (hundredths < 0) return `−${text}`;
  return signed && hundredths > 0 ? `+${text}` : text;
}

/** Every call the Habits screens make, in one place. */
export const habits = {
  items: (includeArchived = false) => api<HabitItem[]>(`/habits/items${includeArchived ? '?includeArchived=1' : ''}`),
  createItem: (body: HabitItemInput) => api<HabitItem>('/habits/items', { method: 'POST', json: body }),
  updateItem: (id: string, body: Partial<HabitItemInput> & { paused?: boolean }) =>
    api<HabitItem>(`/habits/items/${id}`, { method: 'PATCH', json: body }),
  removeItem: (id: string) => api(`/habits/items/${id}`, { method: 'DELETE' }),
  reorderItems: (ids: string[]) => api('/habits/items/reorder', { method: 'POST', json: { ids } }),
  prayerTimes: (day: string) => api<PrayerTimes & { day: string }>(`/habits/prayer-times?day=${day}`),

  day: (day: string) => api<DayReport>(`/habits/days/${day}`),
  mark: (day: string, itemId: string, at?: string) =>
    api<DayReport>(`/habits/days/${day}/marks`, { method: 'POST', json: at ? { itemId, at } : { itemId } }),
  moveMark: (id: string, at: string) => api<DayReport>(`/habits/marks/${id}`, { method: 'PATCH', json: { at } }),
  removeMark: (id: string) => api<DayReport>(`/habits/marks/${id}`, { method: 'DELETE' }),
  skipDay: (day: string, reason?: string) =>
    api<DayReport>(`/habits/days/${day}/skip`, { method: 'PUT', json: reason ? { reason } : {} }),
  unskipDay: (day: string) => api<DayReport>(`/habits/days/${day}/skip`, { method: 'DELETE' }),
  skipItem: (day: string, itemId: string) =>
    api<DayReport>(`/habits/days/${day}/items/${itemId}/skip`, { method: 'PUT', json: {} }),
  unskipItem: (day: string, itemId: string) =>
    api<DayReport>(`/habits/days/${day}/items/${itemId}/skip`, { method: 'DELETE' }),

  stats: (from: string, to: string) =>
    api<{ days: DayScore[]; items: ItemStats[] }>(`/habits/stats?from=${from}&to=${to}`),
  today: () => api<TodayHabitsReport>('/habits/today'),
};
