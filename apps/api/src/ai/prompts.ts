import { DateTime } from 'luxon';
import { PRAYERS } from '@pa/shared';
import { z } from 'zod';
import { appliesToSchema, nameSchema, pointsSchema, remindersSchema, timingSchema } from '../habits/common';
import { type ChatMessage, findByName, type Named, type ParsedExpense, readReply } from './expense-parser';

const system = (lines: string[]): ChatMessage => ({ role: 'system', content: lines.join('\n') });

// ---------------------------------------------------------------- category

export function categoryMessages(name: string, categories: string[]): ChatMessage[] {
  return [
    system([
      'You pick the spending category for one thing a person bought. Reply with JSON only: {"category": string|null}.',
      `Choose exactly one of these names, or null if none fits: ${JSON.stringify(categories)}.`,
    ]),
    { role: 'user', content: name },
  ];
}

export function readCategory(reply: unknown, categories: Named[]): string | null {
  const parsed = z.object({ category: z.string().nullable() }).safeParse(reply);
  return parsed.success ? findByName(categories, parsed.data.category) : null;
}

// -------------------------------------------------------------- several expenses

export const MAX_BULK = 30;

export function bulkMessages(text: string, accounts: string[], categories: string[], today: string): ChatMessage[] {
  return [
    system([
      'You turn a short list of money spent into JSON. Reply with JSON only, no other text.',
      'Shape: {"items": [{"name": string, "amount": number, "account": string|null, "category": string|null, "date": string|null}]}.',
      'One item for each thing spent. The list may be on separate lines or separated by commas.',
      'name: what it was for, short. amount: taka as a plain number ("2k" is 2000).',
      `account: exactly one of these names if it is said or implied, else null: ${JSON.stringify(accounts)}.`,
      `category: exactly one of these names that fits best, else null: ${JSON.stringify(categories)}.`,
      `date: YYYY-MM-DD if a day is named ("yesterday"), else null. Today is ${today}.`,
      'Leave out anything that has no amount.',
    ]),
    { role: 'user', content: text },
  ];
}

export function readBulk(reply: unknown, accounts: Named[], categories: Named[], today: string): ParsedExpense[] {
  const parsed = z.object({ items: z.array(z.unknown()) }).safeParse(reply);
  if (!parsed.success) return [];
  return parsed.data.items
    .slice(0, MAX_BULK)
    .map((item) => readReply(item, accounts, categories, today))
    .filter((item): item is ParsedExpense => item !== null);
}

// ------------------------------------------------------------------- the ask box

export type Intent = { type: 'question' } | { type: 'expense' } | { type: 'action' } | { type: 'reminder'; title: string; when: string };

export function routerMessages(text: string, nowLocal: string, timeZone: string): ChatMessage[] {
  return [
    system([
      'You sort one message typed into a personal money, habits and reminders app. Reply with JSON only.',
      'Shape: {"type": "question"|"expense"|"action"|"reminder", "title": string|null, "when": string|null}.',
      'question: asks about the person\'s own spending or habits ("how much did I spend on food", "which habit do I miss").',
      'expense: says something was bought or spent ("lunch 250", "tea 20, rickshaw 60").',
      'action: asks to change something that exists: tick or skip a habit ("mark gym done"), pause a habit, move an expense to another category, set or remove a budget, add income, or add several things at once.',
      'reminder: asks to be reminded of something at a time ("remind me to pay rent on the 5th at 9am").',
      `For a reminder: title is what to be reminded of, and when is the local time as YYYY-MM-DDTHH:mm in ${timeZone}.`,
      'If no time of day is given, use 09:00. If the day is not clear, use null for when.',
      `Right now it is ${nowLocal} in ${timeZone}.`,
    ]),
    { role: 'user', content: text },
  ];
}

/** Turns the local time the model gave into an instant, or null if it is not a real time in the future. */
export function localToInstant(when: string, timeZone: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return null;
  const parsed = DateTime.fromISO(when, { zone: timeZone });
  if (!parsed.isValid || parsed.toMillis() <= now.getTime()) return null;
  return parsed.toUTC().toISO();
}

export function readIntent(reply: unknown): Intent {
  const parsed = z
    .object({ type: z.enum(['question', 'expense', 'action', 'reminder']), title: z.string().nullable().optional(), when: z.string().nullable().optional() })
    .safeParse(reply);
  if (!parsed.success) return { type: 'question' };
  const { type, title, when } = parsed.data;
  if (type === 'reminder') return title && when ? { type, title: title.trim().slice(0, 200), when } : { type: 'question' };
  return { type };
}

// ------------------------------------------------------------------ plain answers

export function answerMessages(question: string, context: string, today: string, symbol: string): ChatMessage[] {
  return [
    system([
      "You answer questions about one person's own money and habits, using only the data given. Today is " + today + '.',
      `Money amounts are in ${symbol} (taka). Habit points are plain points.`,
      'Be brief and specific: two to five sentences, with the real numbers. No headings or bullet lists.',
      'If the data does not contain the answer, say so plainly instead of guessing.',
      'Never claim to have changed anything: you only read.',
    ]),
    { role: 'user', content: `DATA\n${context}\n\nQUESTION\n${question}` },
  ];
}

export function budgetMessages(context: string, today: string): ChatMessage[] {
  return [
    system([
      `You advise on a monthly spending budget. Today is ${today}. Amounts are in taka.`,
      'The data has, for each category and for the month overall: spent so far, the budget, and the amount projected by the end of the month at the current pace.',
      'Write three to five short sentences: which categories are on course to pass their budget and roughly when, what is fine, and one concrete suggestion.',
      'Use the real numbers. No headings or bullet lists. If there are no budgets, say that setting some would let you advise.',
    ]),
    { role: 'user', content: context },
  ];
}

export function coachMessages(context: string, today: string): ChatMessage[] {
  return [
    system([
      `You are a habit coach reading the last weeks of one person's routine. Today is ${today}.`,
      'The data lists each day with its weekday, score against target, and the outcome of every item (D done on time, L late, M missed, S skipped).',
      'Find two or three real patterns, such as an item missed mostly on certain weekdays, or items that tend to fail together.',
      'Then give one or two small, concrete changes. Name the items. Four to six sentences. No headings or bullet lists.',
      'If there is too little data to see a pattern, say so.',
    ]),
    { role: 'user', content: context },
  ];
}

export function daySummaryMessages(context: string): ChatMessage[] {
  return [
    system([
      "You write a short evening note about one person's habit day.",
      'Say how the day went against its target, what was done well, what lost points and how many, and what is still open. Three to four sentences, warm but plain. No headings or bullet lists.',
    ]),
    { role: 'user', content: context },
  ];
}

export function weeklyMessages(context: string, today: string, symbol: string): ChatMessage[] {
  return [
    system([
      `You write a short weekly review for one person, from their money and habits. Today is ${today}. Money is in ${symbol}.`,
      'Cover: what was spent this week against the week before and the biggest category; how the habit days went (won and lost, the item that lost the most); and one suggestion for next week.',
      'Five to seven short sentences. Plain text only, no headings or bullet lists. Use the real numbers.',
    ]),
    { role: 'user', content: context },
  ];
}

// ---------------------------------------------------------------- routine builder

export function routineMessages(description: string): ChatMessage[] {
  return [
    system([
      'You turn a description of someone\'s ideal day into habit items. Reply with JSON only.',
      'Shape: {"items": [{"name": string, "points": number, "kind": "fixed"|"prayer"|"repeating", "start": "HH:mm"|null, "due": "HH:mm"|null, "prayer": "fajr"|"zuhr"|"asr"|"maghrib"|"isha"|null, "everyMinutes": number|null, "target": number|null, "days": number[]|null}]}.',
      'points: whole points from 1 to 20, bigger for what matters more. days: 0 is Sunday to 6 is Saturday, null for every day.',
      'fixed: done once, due by "due" (and may open at "start"). prayer: tied to a prayer time. repeating: done several times between "start" and "due" every "everyMinutes" minutes, "target" times (for example drinking water).',
      'Times are 24-hour HH:mm and a window must end later than it starts, within one day. Use at most 15 items.',
    ]),
    { role: 'user', content: description },
  ];
}

export interface ProposedItem {
  name: string;
  /** In hundredths of a point, as the routine stores it. */
  points: number;
  timing: z.infer<typeof timingSchema>;
  appliesTo: z.infer<typeof appliesToSchema>;
  reminders: z.infer<typeof remindersSchema>;
}

const rawItem = z.object({
  name: z.string(),
  points: z.number(),
  kind: z.enum(['fixed', 'prayer', 'repeating']),
  start: z.string().nullable().optional(),
  due: z.string().nullable().optional(),
  prayer: z.enum(PRAYERS).nullable().optional(),
  everyMinutes: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  days: z.array(z.number()).nullable().optional(),
});

const definedOnly = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as T;

/** Items the routine will accept, built from the model's simple shape. Anything that does not pass the real rules is dropped. */
export function readRoutine(reply: unknown): ProposedItem[] {
  const parsed = z.object({ items: z.array(z.unknown()) }).safeParse(reply);
  if (!parsed.success) return [];
  const items: ProposedItem[] = [];
  for (const candidate of parsed.data.items.slice(0, 15)) {
    const raw = rawItem.safeParse(candidate);
    if (!raw.success) continue;
    const { name, points, kind, start, due, prayer, everyMinutes, target, days } = raw.data;
    const timing =
      kind === 'fixed'
        ? definedOnly({ kind, start, due })
        : kind === 'prayer'
          ? definedOnly({ kind, prayer, start, end: due })
          : definedOnly({ kind, start, end: due, everyMinutes, target });
    const candidateItem = {
      name: nameSchema.safeParse(name),
      points: pointsSchema.safeParse(Math.round(points * 100)),
      timing: timingSchema.safeParse(timing),
      appliesTo: appliesToSchema.safeParse(
        days && days.length > 0 ? { kind: 'weekdays', days: [...new Set(days)].sort() } : { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
      ),
    };
    if (!candidateItem.name.success || !candidateItem.points.success || !candidateItem.timing.success || !candidateItem.appliesTo.success) continue;
    items.push({
      name: candidateItem.name.data,
      points: candidateItem.points.data,
      timing: candidateItem.timing.data,
      appliesTo: candidateItem.appliesTo.data,
      reminders: { channels: ['push'], onOpen: true, onDue: false, warn: true },
    });
  }
  return items;
}
