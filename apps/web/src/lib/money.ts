import { parseAmount, type ParsedAmount } from '@pa/shared/amount';
import { api } from './api';

// Amounts cross the API as whole paisa. Only this file and the form convert.

/** Reads an amount typed in taka ("12.50") into paisa. */
export function toPaisa(input: string): ParsedAmount {
  return parseAmount(input);
}

/** Paisa to taka, for display and for pre-filling a form. */
export function fromPaisa(paisa: number): number {
  return paisa / 100;
}

/** Paisa as the text a person would type: "80" or "12.50". */
export function paisaToInput(paisa: number): string {
  return paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);
}

/** A balance as typed, allowing zero and a minus sign for an overdrawn account. */
export function toBalancePaisa(text: string): ParsedAmount {
  const trimmed = text.trim();
  if (/^-?0*(.0*)?$/.test(trimmed) && /0/.test(trimmed)) return { ok: true, paisa: 0 };
  const negative = trimmed.startsWith('-');
  const parsed = parseAmount(negative ? trimmed.slice(1) : trimmed);
  return parsed.ok ? { ok: true, paisa: negative ? -parsed.paisa : parsed.paisa } : parsed;
}

export type EntryKind = 'expense' | 'income' | 'transfer' | 'correction' | 'loan';
export type LoanDirection = 'lent' | 'borrowed' | 'repaid_to_me' | 'repaid_by_me';
export type BudgetState = 'ok' | 'warning' | 'over';

export interface Account {
  id: string;
  name: string;
  openingBalance: number;
  openingDate: string;
  sortOrder: number;
  archived: boolean;
  balance: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  isFees: boolean;
  archived: boolean;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  date: string;
  amount: number;
  name: string;
  note: string | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  personId: string | null;
  loanDirection: LoanDirection | null;
  feeOfId: string | null;
  fee: { id: string; amount: number } | null;
  createdAt: string;
}

export interface NameSuggestion {
  name: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
}

export interface Shortcut {
  id: string;
  name: string;
  amount: number;
  accountId: string;
  categoryId: string;
  sortOrder: number;
  usable: boolean;
}

export interface Budget {
  categoryId: string | null;
  amount: number;
}

export interface Person {
  id: string;
  name: string;
  archived: boolean;
  owed: number;
}

export interface Comparison {
  current: number;
  previous: number | null;
  change: number | null;
  percent: number | null;
}

export interface CategoryLine {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  archived: boolean;
  spent: number;
  share: number;
  previous: number | null;
  budget: number | null;
  state: BudgetState | null;
}

export interface MonthReport {
  month: string;
  spent: Comparison;
  income: Comparison;
  byCategory: CategoryLine[];
  overall: { budget: number | null; state: BudgetState | null };
  byDayType: { dayTypeId: string; name: string; total: number; days: number; average: number }[];
  hasEarlierMonth: boolean;
}

export interface DayReport {
  date: string;
  spent: number;
  income: number;
  entries: Entry[];
}

export interface TodayReport {
  date: string;
  spent: number;
  comparedToSameWeekdayLastWeek: Comparison;
  balances: { id: string; name: string; balance: number }[];
}

const query = (params: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, value === true ? '1' : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Every call the Money screens make, in one place. */
export const money = {
  accounts: (includeArchived = false) => api<Account[]>(`/money/accounts${query({ includeArchived })}`),
  createAccount: (body: { name: string; openingBalance: number; openingDate: string }) =>
    api<Account>('/money/accounts', { method: 'POST', json: body }),
  updateAccount: (id: string, body: Partial<Pick<Account, 'name' | 'openingBalance' | 'openingDate' | 'archived'>>) =>
    api<Account>(`/money/accounts/${id}`, { method: 'PATCH', json: body }),
  reorderAccounts: (ids: string[]) => api('/money/accounts/reorder', { method: 'POST', json: { ids } }),

  categories: (includeArchived = false) => api<Category[]>(`/money/categories${query({ includeArchived })}`),
  createCategory: (body: { name: string; color: string; icon: string }) =>
    api<Category>('/money/categories', { method: 'POST', json: body }),
  updateCategory: (id: string, body: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'archived'>>) =>
    api<Category>(`/money/categories/${id}`, { method: 'PATCH', json: body }),
  reorderCategories: (ids: string[]) => api('/money/categories/reorder', { method: 'POST', json: { ids } }),
  mergeCategory: (id: string, intoId: string) =>
    api(`/money/categories/${id}/merge`, { method: 'POST', json: { intoId } }),

  entries: (filter: { date?: string; from?: string; to?: string; accountId?: string; categoryId?: string; q?: string; limit?: number }) =>
    api<Entry[]>(`/money/entries${query(filter)}`),
  createEntry: (body: Record<string, unknown>) => api<Entry>('/money/entries', { method: 'POST', json: body }),
  updateEntry: (id: string, body: Record<string, unknown>) =>
    api<Entry>(`/money/entries/${id}`, { method: 'PATCH', json: body }),
  deleteEntry: (id: string) => api(`/money/entries/${id}`, { method: 'DELETE' }),
  names: (q: string) => api<NameSuggestion[]>(`/money/entries/names${query({ q })}`),

  shortcuts: () => api<Shortcut[]>('/money/shortcuts'),
  createShortcut: (body: { name: string; amount: number; accountId: string; categoryId: string }) =>
    api<Shortcut>('/money/shortcuts', { method: 'POST', json: body }),
  updateShortcut: (id: string, body: Partial<{ name: string; amount: number; accountId: string; categoryId: string }>) =>
    api<Shortcut>(`/money/shortcuts/${id}`, { method: 'PATCH', json: body }),
  deleteShortcut: (id: string) => api(`/money/shortcuts/${id}`, { method: 'DELETE' }),
  reorderShortcuts: (ids: string[]) => api('/money/shortcuts/reorder', { method: 'POST', json: { ids } }),
  useShortcut: (id: string, body: { amount?: number; date?: string } = {}) =>
    api<Entry>(`/money/shortcuts/${id}/use`, { method: 'POST', json: body }),

  budgets: () => api<Budget[]>('/money/budgets'),
  setBudget: (categoryId: string | null, amount: number) =>
    api('/money/budgets', { method: 'PUT', json: { categoryId, amount } }),

  people: (includeArchived = false) => api<Person[]>(`/money/people${query({ includeArchived })}`),
  createPerson: (name: string) => api<Person>('/money/people', { method: 'POST', json: { name } }),
  updatePerson: (id: string, body: { name?: string; archived?: boolean }) =>
    api<Person>(`/money/people/${id}`, { method: 'PATCH', json: body }),
  personHistory: (id: string) => api<Entry[]>(`/money/people/${id}/history`),
  createLoan: (body: { personId: string; direction: LoanDirection; amount: number; accountId: string; date?: string; note?: string }) =>
    api<Entry>('/money/loans', { method: 'POST', json: body }),

  day: (date: string) => api<DayReport>(`/money/reports/day${query({ date })}`),
  month: (month?: string) => api<MonthReport>(`/money/reports/month${query({ month })}`),
  today: () => api<TodayReport>('/money/reports/today'),
};
