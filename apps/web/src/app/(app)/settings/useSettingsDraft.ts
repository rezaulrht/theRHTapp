'use client';

import type { Settings } from '@pa/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import { ApiError, type FieldError } from '@/lib/api';

export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Editing state for a settings form: a working copy of the settings, a save
 * that sends only what changed, and the server's errors by field.
 */
export function useSettingsDraft() {
  const { settings, loadError, save } = useSettings();
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [state, setState] = useState<SaveState>('idle');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Take the loaded settings as the starting point (and again after a save).
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setState('idle');
  }, []);

  const submit = useCallback(async () => {
    if (!settings || !draft) return;
    const patch: Partial<Settings> = {};
    for (const key of Object.keys(draft) as (keyof Settings)[]) {
      if (JSON.stringify(draft[key]) !== JSON.stringify(settings[key])) {
        (patch as Record<string, unknown>)[key] = draft[key];
      }
    }
    setErrors([]);
    setFormError(null);
    if (Object.keys(patch).length === 0) {
      setState('saved');
      return;
    }
    setState('saving');
    try {
      await save(patch);
      setState('saved');
    } catch (error) {
      setState('idle');
      if (error instanceof ApiError && error.errors?.length) setErrors(error.errors);
      else setFormError(error instanceof Error ? error.message : 'Could not save. Try again.');
    }
  }, [draft, settings, save]);

  /** The server's message for a field, by its dotted path. */
  const errorAt = useCallback(
    (path: string) => errors.find((error) => error.path === path)?.message,
    [errors],
  );

  /** Messages for errors no field on this form claimed, so nothing is silently dropped. */
  const otherErrors = useCallback(
    (shown: string[]) =>
      errors.filter((error) => !shown.includes(error.path)).map((error) => error.message),
    [errors],
  );

  return { draft, set, submit, state, errorAt, otherErrors, formError, loadError };
}
