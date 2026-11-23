import { api } from './api';

/**
 * A copy of the last answer for a page's reads, kept on this device. The server
 * is far away, so a screen opens at once from the copy and then swaps in the
 * fresh answer. The copy is private to this device and is wiped on logout.
 */
const PREFIX = 'pa.cache.v1:';
/** Old copies are dropped beyond this many, oldest first, so day-by-day paths do not pile up. */
const MAX_ENTRIES = 60;

interface Stored {
  at: number;
  data: unknown;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readCache<T>(path: string): T | undefined {
  try {
    const raw = storage()?.getItem(PREFIX + path);
    return raw ? ((JSON.parse(raw) as Stored).data as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(path: string, data: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + path, JSON.stringify({ at: Date.now(), data } satisfies Stored));
    const keys = Object.keys(store).filter((key) => key.startsWith(PREFIX));
    if (keys.length > MAX_ENTRIES) {
      const oldest = keys
        .map((key) => ({ key, at: (JSON.parse(store.getItem(key) ?? '{}') as Partial<Stored>).at ?? 0 }))
        .sort((a, b) => a.at - b.at)
        .slice(0, keys.length - MAX_ENTRIES);
      for (const { key } of oldest) store.removeItem(key);
    }
  } catch {
    // Storage full or blocked: the page just works without a copy.
  }
}

/** Forgets every copy. Called when the owner logs out, so the next person on this device sees nothing. */
export function clearCache(): void {
  const store = storage();
  if (!store) return;
  try {
    for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key);
  } catch {
    // Nothing more can be done.
  }
}

/**
 * Reads `path`, calling `onData` with the saved copy straight away if there is
 * one, then again with the fresh answer. If the fresh read fails and a copy was
 * shown, the copy stays and nothing is thrown; with no copy, the error is thrown
 * so the page can say what went wrong.
 */
export async function swr<T>(path: string, onData: (data: T) => void): Promise<void> {
  const copy = readCache<T>(path);
  const hadCopy = copy !== undefined;
  if (hadCopy) onData(copy);
  try {
    const fresh = await api<T>(path);
    writeCache(path, fresh);
    onData(fresh);
  } catch (error) {
    if (!hadCopy) throw error;
  }
}
