import { api } from './api';

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

/** The assistant. It only suggests: what it returns fills a form that a person still checks and saves. */
export const ai = {
  status: () => api<AssistantStatus>('/ai/status'),
  saveKey: (key: string) => api('/ai/key', { method: 'PUT', json: { key } }),
  removeKey: () => api('/ai/key', { method: 'DELETE' }),
  parseExpense: (text: string) => api<ParsedExpense>('/ai/parse-expense', { method: 'POST', json: { text } }),
};
