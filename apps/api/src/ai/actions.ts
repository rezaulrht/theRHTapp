import { z } from 'zod';
import { daySchema } from '../habits/common';
import { type ChatMessage, findByName, type Named } from './expense-parser';
import { localToInstant } from './prompts';

/**
 * What the assistant is allowed to do. This list is the whole of its power:
 * nothing outside it can be proposed, and nothing here deletes anything.
 * Each action is proposed with names, turned into exact ids here, shown to the
 * person, and only run after they confirm.
 */
const label = z.string().max(200).optional();

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mark_habit_done'), itemId: z.string().min(1), day: daySchema, label }),
  z.object({ type: z.literal('skip_habit'), itemId: z.string().min(1), day: daySchema, label }),
  z.object({ type: z.literal('pause_habit'), itemId: z.string().min(1), label }),
  z.object({ type: z.literal('resume_habit'), itemId: z.string().min(1), label }),
  z.object({
    type: z.literal('add_expense'),
    name: z.string().trim().min(1).max(120),
    amount: z.number().int().positive(),
    accountId: z.string().min(1),
    categoryId: z.string().min(1),
    date: daySchema,
    label,
  }),
  z.object({
    type: z.literal('add_income'),
    name: z.string().trim().min(1).max(120),
    amount: z.number().int().positive(),
    accountId: z.string().min(1),
    date: daySchema,
    label,
  }),
  z.object({ type: z.literal('recategorize_entry'), entryId: z.string().min(1), categoryId: z.string().min(1), label }),
  z.object({ type: z.literal('set_budget'), categoryId: z.string().min(1).nullable(), amount: z.number().int().min(0), label }),
  z.object({ type: z.literal('create_reminder'), title: z.string().trim().min(1).max(200), at: z.iso.datetime({ offset: true }), label }),
]);

export type ActionPayload = z.infer<typeof actionSchema>;

export interface ProposedAction {
  /** What will happen, in plain words, for the person to read before confirming. */
  summary: string;
  payload: ActionPayload;
}

/** What the model is told it may propose. Names, not ids: ids are found here. */
export const ACTION_CATALOG = [
  '{"type":"mark_habit_done","item":"<habit name>"}  - tick a habit as done today',
  '{"type":"skip_habit","item":"<habit name>"}  - skip a habit for today, nothing is scored',
  '{"type":"pause_habit","item":"<habit name>"}  - take a habit off the routine for now',
  '{"type":"resume_habit","item":"<habit name>"}  - put a paused habit back',
  '{"type":"add_expense","name":"<what>","amount":<taka>,"account":"<name>|null","category":"<name>|null","date":"YYYY-MM-DD|null"}',
  '{"type":"add_income","name":"<where from>","amount":<taka>,"account":"<name>|null","date":"YYYY-MM-DD|null"}',
  '{"type":"recategorize_entry","entry":"<what the entry was called>","onDate":"YYYY-MM-DD|null","category":"<name>"}  - change the category of an existing expense',
  '{"type":"set_budget","category":"<name>|null","amount":<taka>}  - the monthly budget for a category, or null for the whole month; amount 0 removes it',
  '{"type":"create_reminder","title":"<what>","when":"YYYY-MM-DDTHH:mm"}  - local time',
];

const rawAction = z.object({
  type: z.enum(['mark_habit_done', 'skip_habit', 'pause_habit', 'resume_habit', 'add_expense', 'add_income', 'recategorize_entry', 'set_budget', 'create_reminder']),
  item: z.string().nullish(),
  name: z.string().nullish(),
  amount: z.number().nullish(),
  account: z.string().nullish(),
  category: z.string().nullish(),
  date: z.string().nullish(),
  entry: z.string().nullish(),
  onDate: z.string().nullish(),
  title: z.string().nullish(),
  when: z.string().nullish(),
});

export interface ResolveContext {
  habitItems: Named[];
  accounts: Named[];
  categories: Named[];
  /** Past expenses, newest first, for finding the one to recategorize. */
  entries: { id: string; name: string; date: string; amount: number; categoryId: string | null }[];
  today: string;
  /** The habit day that is running now. */
  habitDay: string;
  timeZone: string;
  now: Date;
  /** Formats paisa for the preview, for example "৳250". */
  money(paisa: number): string;
}

export const MAX_ACTIONS = 10;

const norm = (value: string): string => value.trim().toLowerCase();
const validDay = (value: string | null | undefined, today: string): string =>
  value && daySchema.safeParse(value).success && value <= today ? value : today;

/**
 * Turns what the model proposed into exact actions with a plain-words summary.
 * Anything that cannot be matched to something real is left out and reported,
 * never guessed at.
 */
export function resolveActions(reply: unknown, context: ResolveContext): { actions: ProposedAction[]; notes: string[] } {
  const parsed = z.object({ actions: z.array(z.unknown()) }).safeParse(reply);
  const actions: ProposedAction[] = [];
  const notes: string[] = [];
  if (!parsed.success) return { actions, notes };

  const categoryName = (id: string) => context.categories.find((category) => category.id === id)?.name ?? '';
  const accountName = (id: string) => context.accounts.find((account) => account.id === id)?.name ?? '';

  for (const candidate of parsed.data.actions.slice(0, MAX_ACTIONS)) {
    const raw = rawAction.safeParse(candidate);
    if (!raw.success) continue;
    const a = raw.data;

    const habit = () => {
      const id = findByName(context.habitItems, a.item);
      return id ? { id, name: context.habitItems.find((item) => item.id === id)!.name } : null;
    };

    switch (a.type) {
      case 'mark_habit_done':
      case 'skip_habit': {
        const item = habit();
        if (!item) {
          notes.push(`There is no habit called "${a.item ?? ''}" on your routine.`);
          break;
        }
        const verb = a.type === 'mark_habit_done' ? `Mark ${item.name} as done today` : `Skip ${item.name} today`;
        actions.push({ summary: verb, payload: { type: a.type, itemId: item.id, day: context.habitDay, label: item.name } });
        break;
      }
      case 'pause_habit':
      case 'resume_habit': {
        const item = habit();
        if (!item) {
          notes.push(`There is no habit called "${a.item ?? ''}" on your routine.`);
          break;
        }
        const verb = a.type === 'pause_habit' ? `Pause ${item.name}` : `Put ${item.name} back on the routine`;
        actions.push({ summary: verb, payload: { type: a.type, itemId: item.id, label: item.name } });
        break;
      }
      case 'add_expense': {
        const paisa = a.amount ? Math.round(a.amount * 100) : 0;
        const accountId = findByName(context.accounts, a.account) ?? context.accounts[0]?.id;
        const categoryId = findByName(context.categories, a.category) ?? context.categories[0]?.id;
        if (!a.name?.trim() || paisa <= 0 || !accountId || !categoryId) {
          notes.push('An expense had no amount or name, so it was left out.');
          break;
        }
        actions.push({
          summary: `Add expense: ${a.name.trim()}, ${context.money(paisa)}, ${categoryName(categoryId)}, from ${accountName(accountId)}`,
          payload: { type: 'add_expense', name: a.name.trim().slice(0, 120), amount: paisa, accountId, categoryId, date: validDay(a.date, context.today), label: a.name.trim() },
        });
        break;
      }
      case 'add_income': {
        const paisa = a.amount ? Math.round(a.amount * 100) : 0;
        const accountId = findByName(context.accounts, a.account) ?? context.accounts[0]?.id;
        if (!a.name?.trim() || paisa <= 0 || !accountId) {
          notes.push('Some income had no amount or name, so it was left out.');
          break;
        }
        actions.push({
          summary: `Add income: ${a.name.trim()}, ${context.money(paisa)}, into ${accountName(accountId)}`,
          payload: { type: 'add_income', name: a.name.trim().slice(0, 120), amount: paisa, accountId, date: validDay(a.date, context.today), label: a.name.trim() },
        });
        break;
      }
      case 'recategorize_entry': {
        const categoryId = findByName(context.categories, a.category);
        const wanted = norm(a.entry ?? '');
        const onDate = a.onDate && daySchema.safeParse(a.onDate).success ? a.onDate : null;
        const entry = wanted
          ? context.entries.find((item) => (onDate === null || item.date === onDate) && (norm(item.name) === wanted || norm(item.name).includes(wanted)))
          : undefined;
        if (!categoryId || !entry) {
          notes.push(!categoryId ? `There is no category called "${a.category ?? ''}".` : `Could not find a recent expense called "${a.entry ?? ''}".`);
          break;
        }
        actions.push({
          summary: `Move "${entry.name}" (${context.money(entry.amount)}, ${entry.date}) to ${categoryName(categoryId)}`,
          payload: { type: 'recategorize_entry', entryId: entry.id, categoryId, label: entry.name },
        });
        break;
      }
      case 'set_budget': {
        const paisa = a.amount !== null && a.amount !== undefined && a.amount >= 0 ? Math.round(a.amount * 100) : -1;
        const categoryId = a.category ? findByName(context.categories, a.category) : null;
        if (paisa < 0 || (a.category && !categoryId)) {
          notes.push(paisa < 0 ? 'A budget had no amount, so it was left out.' : `There is no category called "${a.category ?? ''}".`);
          break;
        }
        const target = categoryId ? `${categoryName(categoryId)} budget` : 'Budget for the whole month';
        actions.push({
          summary: paisa === 0 ? `Remove the ${target.toLowerCase()}` : `Set the ${target.toLowerCase()} to ${context.money(paisa)} a month`,
          payload: { type: 'set_budget', categoryId, amount: paisa, label: target },
        });
        break;
      }
      case 'create_reminder': {
        const at = a.when ? localToInstant(a.when, context.timeZone, context.now) : null;
        if (!a.title?.trim() || !at) {
          notes.push('A reminder had no clear time in the future, so it was left out.');
          break;
        }
        actions.push({ summary: `Remind you: ${a.title.trim()}, ${a.when?.replace('T', ' ')}`, payload: { type: 'create_reminder', title: a.title.trim().slice(0, 200), at, label: a.title.trim() } });
        break;
      }
    }
  }
  return { actions, notes };
}

/** Asks the model to turn a request to change things into actions from the catalog. */
export function actionMessages(
  text: string,
  lists: { habits: string[]; accounts: string[]; categories: string[] },
  today: string,
  nowLocal: string,
  timeZone: string,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You turn a request to change things in a personal money and habits app into actions. Reply with JSON only: {"actions": [ ... ]}.',
        'Use only these actions, written exactly in these shapes, and nothing else. Never invent a habit, account or category.',
        ...ACTION_CATALOG,
        `The habits on the routine: ${JSON.stringify(lists.habits)}.`,
        `The accounts: ${JSON.stringify(lists.accounts)}. The categories: ${JSON.stringify(lists.categories)}.`,
        `Use names exactly as listed. Amounts are in taka as plain numbers ("2k" is 2000). Today is ${today}. Right now it is ${nowLocal} in ${timeZone}.`,
        'Use at most 10 actions. If the request asks for something not in the list (such as deleting), reply {"actions": []}.',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}
