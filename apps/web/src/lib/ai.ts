import { api } from './api';
import { swr } from './cache';
import type { AppliesTo, Timing } from './habits';

export interface ParsedExpense {
  name: string;
  /** Whole paisa. */
  amount: number;
  accountId: string | null;
  categoryId: string | null;
  date: string;
}

export interface AssistantStatus {
  enabled: boolean;
  /** Where the key in use comes from. A key saved in Settings wins over the server's own. */
  source: 'settings' | 'env' | null;
  /** The last four characters of a saved key. Never the key. */
  hint: string | null;
}

/** One thing the assistant proposes to do. The payload is sent back untouched when the person confirms. */
export interface ProposedAction {
  summary: string;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** What the ask box got back: an answer, changes to confirm, expenses to confirm, or a reminder to confirm. */
export type AskAnswer =
  | { type: 'answer'; text: string }
  | { type: 'actions'; actions: ProposedAction[]; notes: string[] }
  | { type: 'expense'; items: ParsedExpense[] }
  | { type: 'reminder'; title: string; at: string; whenText: string };

export interface ProposedItem {
  name: string;
  /** Hundredths of a point, as the routine stores it. */
  points: number;
  timing: Timing;
  appliesTo: AppliesTo;
  reminders: { channels: ('push' | 'email')[]; onOpen: boolean; onDue: boolean; warn: boolean };
}

/** The assistant. It only suggests: what it returns fills a form or a preview that a person still checks. */
export const ai = {
  status: () => api<AssistantStatus>('/ai/status'),
  /** The last known status at once, then the fresh one. */
  statusSwr: (onData: (status: AssistantStatus) => void) => swr<AssistantStatus>('/ai/status', onData),
  saveKey: (key: string) => api('/ai/key', { method: 'PUT', json: { key } }),
  removeKey: () => api('/ai/key', { method: 'DELETE' }),

  parseExpense: (text: string) => api<ParsedExpense>('/ai/parse-expense', { method: 'POST', json: { text } }),
  parseExpenses: (text: string) => api<{ items: ParsedExpense[] }>('/ai/parse-expenses', { method: 'POST', json: { text } }),
  suggestCategory: (name: string) => api<{ categoryId: string | null }>('/ai/suggest-category', { method: 'POST', json: { name } }),
  budgetAdvice: () => api<{ text: string }>('/ai/budget-advice'),

  ask: (text: string, scope?: 'money' | 'habits' | 'all') => api<AskAnswer>('/ai/ask', { method: 'POST', json: scope ? { text, scope } : { text } }),
  act: (actions: ProposedAction['payload'][]) => api<{ results: ActionResult[] }>('/ai/act', { method: 'POST', json: { actions } }),
  createReminder: (title: string, at: string) => api<{ id: string }>('/ai/create-reminder', { method: 'POST', json: { title, at } }),

  habitCoach: () => api<{ text: string }>('/ai/habit-coach', { method: 'POST' }),
  daySummary: (day?: string) => api<{ text: string }>('/ai/day-summary', { method: 'POST', json: day ? { day } : {} }),
  routine: (description: string) => api<{ items: ProposedItem[] }>('/ai/routine', { method: 'POST', json: { description } }),

  weeklyReviewNow: () => api<{ text: string }>('/ai/weekly-review/now', { method: 'POST' }),
};
