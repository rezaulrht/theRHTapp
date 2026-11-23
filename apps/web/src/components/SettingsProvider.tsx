'use client';

import type { Settings } from '@pa/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { swr, writeCache } from '@/lib/cache';

interface SettingsState {
  /** Null until the first load finishes. */
  settings: Settings | null;
  /** Set when loading failed for a reason other than being logged out. */
  loadError: string | null;
  /** Saves a partial change and updates every page using the settings. Rejects with `ApiError`. */
  save(patch: Partial<Settings>): Promise<Settings>;
  reload(): Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

/** Loads the owner's settings once and shares them with every page in the app. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      await swr<Settings>('/settings', setSettings);
      setLoadError(null);
    } catch (error) {
      // A 401 is already on its way to the login page.
      if (error instanceof ApiError && error.status === 401) return;
      setLoadError(error instanceof Error ? error.message : 'Settings could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (patch: Partial<Settings>) => {
    const next = await api<Settings>('/settings', { method: 'PATCH', json: patch });
    setSettings(next);
    writeCache('/settings', next);
    return next;
  }, []);

  const value = useMemo(() => ({ settings, loadError, save, reload }), [settings, loadError, save, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const state = useContext(SettingsContext);
  if (!state) throw new Error('useSettings must be used inside SettingsProvider');
  return state;
}

/** Like `useSettings`, but returns null outside the provider instead of throwing. */
export function useOptionalSettings(): SettingsState | null {
  return useContext(SettingsContext);
}
