import { api } from './api';

export type ItemKind = 'file' | 'note' | 'link';
export type FieldType = 'text' | 'number' | 'date' | 'choice' | 'url' | 'boolean';
export type Channel = 'push' | 'email';

export interface PathStep {
  id: string;
  name: string;
}

export interface VaultFolder {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  pinned: boolean;
  path: PathStep[];
  values: Record<string, unknown>;
  updatedAt: string;
}

export interface VaultItem {
  id: string;
  folderId: string | null;
  kind: ItemKind;
  name: string;
  sortOrder: number;
  pinned: boolean;
  body: string | null;
  excerpt: string | null;
  url: string | null;
  file: { size: number; mimeType: string; uploaded: boolean } | null;
  tagIds: string[];
  values: Record<string, unknown>;
  path: PathStep[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultTodo {
  id: string;
  folderId: string;
  text: string;
  dueDate: string | null;
  remind: boolean;
  done: boolean;
  sortOrder: number;
}

export interface FolderContents {
  folder: VaultFolder | null;
  folders: VaultFolder[];
  items: VaultItem[];
  todos: VaultTodo[];
}

export interface VaultHome {
  folders: VaultFolder[];
  items: VaultItem[];
  pinned: { folders: VaultFolder[]; items: VaultItem[] };
  recent: VaultItem[];
}

export interface VaultTag {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface VaultField {
  id: string;
  name: string;
  type: FieldType;
  choices: string[];
  sortOrder: number;
  archived: boolean;
}

export type FilterOp = 'eq' | 'contains' | 'lt' | 'gt' | 'set' | 'unset';
export interface FieldFilter {
  fieldId: string;
  op: FilterOp;
  value?: string | number | boolean;
}

export interface ListQuery {
  filters?: FieldFilter[];
  sort?: 'name' | 'updated' | `field:${string}`;
  descending?: boolean;
}

export type Schedule =
  | { kind: 'once'; at: string }
  | { kind: 'weekly'; days: number[]; time: string; offsetMinutes?: number }
  | { kind: 'interval'; days: number[]; start: string; end: string; everyMinutes: number };

export interface VaultReminder {
  id: string;
  owner: string;
  title: string;
  body: string;
  schedule: Schedule;
  channels: Channel[];
  ignoreQuietHours: boolean;
  next: string | null;
}

export interface CalendarEntry {
  date: string;
  kind: 'reminder' | 'todo' | 'field';
  title: string;
  at: string | null;
  done: boolean;
  link: string;
}

export interface TrashEntry {
  id: string;
  kind: 'folder' | ItemKind;
  name: string;
  trashedAt: string;
  removeAt: string;
  folders: number;
  items: number;
}

export type Matched = 'name' | 'note' | 'link' | 'tag' | 'field';

export interface Upload {
  item: VaultItem;
  upload: { url: string; headers: Record<string, string> };
}

/** "root" is the top level of the Vault. */
export const ROOT = 'root';

function listParams(query: ListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.filters && query.filters.length > 0) params.set('filter', JSON.stringify(query.filters));
  if (query.sort) params.set('sort', query.sort);
  if (query.descending) params.set('dir', 'desc');
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Every call the Vault screens make, in one place. */
export const vault = {
  home: () => api<VaultHome>('/vault/home'),
  folder: (id: string, query?: ListQuery) => api<FolderContents>(`/vault/folders/${id}${listParams(query)}`),
  createFolder: (parentId: string | null, name: string) =>
    api<VaultFolder>('/vault/folders', { method: 'POST', json: { parentId, name } }),
  updateFolder: (id: string, body: { name?: string; pinned?: boolean }) =>
    api<VaultFolder>(`/vault/folders/${id}`, { method: 'PATCH', json: body }),
  trashFolder: (id: string) => api(`/vault/folders/${id}`, { method: 'DELETE' }),
  reorder: (id: string, folderIds: string[], itemIds: string[]) =>
    api(`/vault/folders/${id}/reorder`, { method: 'POST', json: { folderIds, itemIds } }),
  move: (folderIds: string[], itemIds: string[], targetId: string | null) =>
    api('/vault/move', { method: 'POST', json: { folderIds, itemIds, targetId } }),

  item: (id: string) => api<VaultItem>(`/vault/items/${id}`),
  createNote: (folderId: string | null, name: string, body = '') =>
    api<VaultItem>('/vault/items', { method: 'POST', json: { kind: 'note', folderId, name, body } }),
  createLink: (folderId: string | null, name: string, url: string) =>
    api<VaultItem>('/vault/items', { method: 'POST', json: { kind: 'link', folderId, name, url } }),
  updateItem: (id: string, body: { name?: string; body?: string; url?: string; pinned?: boolean }) =>
    api<VaultItem>(`/vault/items/${id}`, { method: 'PATCH', json: body }),
  trashItem: (id: string) => api(`/vault/items/${id}`, { method: 'DELETE' }),

  startUpload: (folderId: string | null, name: string, size: number, mimeType: string) =>
    api<Upload>('/vault/files', { method: 'POST', json: { folderId, name, size, mimeType } }),
  completeUpload: (id: string) => api<VaultItem>(`/vault/files/${id}/complete`, { method: 'POST' }),
  fileUrl: (id: string, inline: boolean) => api<{ url: string }>(`/vault/files/${id}/url${inline ? '?inline=1' : ''}`),
  fileText: (id: string) => api<{ text: string }>(`/vault/files/${id}/text`),
  storage: () => api<{ used: number; allowance: number; files: number }>('/vault/storage'),

  tags: () => api<VaultTag[]>('/vault/tags'),
  createTag: (name: string, color?: string) => api<VaultTag>('/vault/tags', { method: 'POST', json: color ? { name, color } : { name } }),
  updateTag: (id: string, body: { name?: string; color?: string }) => api<VaultTag>(`/vault/tags/${id}`, { method: 'PATCH', json: body }),
  deleteTag: (id: string) => api(`/vault/tags/${id}`, { method: 'DELETE' }),
  tagItems: (id: string) => api<{ tag: VaultTag; items: VaultItem[] }>(`/vault/tags/${id}/items`),
  setItemTags: (id: string, tagIds: string[]) => api<VaultItem>(`/vault/items/${id}/tags`, { method: 'PUT', json: { tagIds } }),

  fields: () => api<VaultField[]>('/vault/fields'),
  createField: (body: { name: string; type: FieldType; choices?: string[] }) =>
    api<VaultField>('/vault/fields', { method: 'POST', json: body }),
  updateField: (id: string, body: { name?: string; choices?: string[]; archived?: boolean }) =>
    api<VaultField>(`/vault/fields/${id}`, { method: 'PATCH', json: body }),
  reorderFields: (ids: string[]) => api('/vault/fields/reorder', { method: 'POST', json: { ids } }),
  setValue: (body: { fieldId: string; folderId?: string; itemId?: string; value: unknown }) =>
    api<{ fieldId: string; value: unknown }>('/vault/values', { method: 'PUT', json: body }),

  search: (q: string) =>
    api<{ folders: (VaultFolder & { matched: Matched })[]; items: (VaultItem & { matched: Matched })[] }>(
      `/vault/search?q=${encodeURIComponent(q)}`,
    ),

  trash: () => api<TrashEntry[]>('/vault/trash'),
  restore: (id: string) => api(`/vault/trash/${id}/restore`, { method: 'POST' }),
  emptyTrash: () => api<{ left: number }>('/vault/trash', { method: 'DELETE' }),

  createTodo: (folderId: string, body: { text: string; dueDate?: string | null; remind?: boolean }) =>
    api<VaultTodo>(`/vault/folders/${folderId}/todos`, { method: 'POST', json: body }),
  updateTodo: (id: string, body: { text?: string; dueDate?: string | null; remind?: boolean; done?: boolean }) =>
    api<VaultTodo>(`/vault/todos/${id}`, { method: 'PATCH', json: body }),
  deleteTodo: (id: string) => api(`/vault/todos/${id}`, { method: 'DELETE' }),

  reminders: (owner: string) => api<VaultReminder[]>(`/vault/reminders?owner=${encodeURIComponent(owner)}`),
  createReminder: (body: { owner: string; title: string; schedule: Schedule; channels: Channel[] }) =>
    api<VaultReminder>('/vault/reminders', { method: 'POST', json: body }),
  deleteReminder: (id: string) => api(`/vault/reminders/${id}`, { method: 'DELETE' }),

  calendar: (from: string, to: string) => api<CalendarEntry[]>(`/vault/calendar?from=${from}&to=${to}`),
  today: () => api<{ pinned: { folders: VaultFolder[]; items: VaultItem[] }; upcoming: CalendarEntry[] }>('/vault/today'),
};

/**
 * Sends a file's bytes straight to storage on its signed address. Storage is
 * not the app's own API, so this is a plain request, not `api()`.
 */
export async function sendFile(upload: Upload['upload'], file: Blob): Promise<void> {
  const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: file });
  if (!response.ok) throw new Error(`The upload was refused (${response.status}). Try again.`);
}
