import { z } from 'zod';

export interface Named {
  id: string;
  name: string;
}

export interface ParsedExpense {
  name: string;
  /** Whole paisa. */
  amount: number;
  accountId: string | null;
  categoryId: string | null;
  /** A calendar day, never later than today. */
  date: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const MAX_TEXT = 300;

/** What the model is asked to send back. Anything else is rejected. */
const replySchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** In taka, as a person would say it: 250 or 12.5. */
  amount: z.number().positive().max(10_000_000),
  account: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

/** The instructions and the one sentence to read. The model only reads; nothing it says is saved without a person confirming. */
export function buildMessages(text: string, accounts: string[], categories: string[], today: string): ChatMessage[] {
  const system = [
    'You turn one short sentence about money spent into JSON. Reply with JSON only, no other text.',
    'Shape: {"name": string, "amount": number, "account": string|null, "category": string|null, "date": string|null}.',
    'name: what it was for, short, as the person would write it (for example "Lunch").',
    'amount: the amount spent in taka, as a plain number. "2k" is 2000, "1.5k" is 1500.',
    `account: choose exactly one of these names if the sentence says or implies how it was paid, else null: ${JSON.stringify(accounts)}.`,
    `category: choose exactly one of these names that best fits what it was for, else null: ${JSON.stringify(categories)}.`,
    `date: YYYY-MM-DD if the sentence names a day ("yesterday", "on Friday"), else null. Today is ${today}.`,
    'If the sentence has no amount, reply {"error": "no amount"}.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ];
}

const norm = (value: string): string => value.trim().toLowerCase();

/** The one whose name the model gave, tolerating a different case or a name inside the other. */
export function findByName(list: Named[], wanted: string | null | undefined): string | null {
  if (!wanted || norm(wanted) === '') return null;
  const target = norm(wanted);
  const exact = list.find((item) => norm(item.name) === target);
  if (exact) return exact.id;
  const partial = list.find((item) => norm(item.name).includes(target) || target.includes(norm(item.name)));
  return partial?.id ?? null;
}

/** Checks the model's answer and turns it into something the form can use, or null when it is not usable. */
export function readReply(reply: unknown, accounts: Named[], categories: Named[], today: string): ParsedExpense | null {
  const parsed = replySchema.safeParse(reply);
  if (!parsed.success) return null;
  const { name, amount, account, category, date } = parsed.data;

  const paisa = Math.round(amount * 100);
  if (!Number.isSafeInteger(paisa) || paisa <= 0) return null;

  // A date the model made up that has not come yet, or is not a real day, becomes today.
  const valid = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && date <= today;

  return {
    name,
    amount: paisa,
    accountId: findByName(accounts, account),
    categoryId: findByName(categories, category),
    date: valid ? date : today,
  };
}
