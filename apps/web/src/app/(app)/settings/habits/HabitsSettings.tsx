'use client';

import { useCallback, useEffect, useState } from 'react';
import { FadeUp } from '@/components/motion/Stagger';
import { useSettings } from '@/components/SettingsProvider';
import { habits, type HabitItem } from '@/lib/habits';
import { HabitRules } from './HabitRules';
import { ItemsEditor } from './ItemsEditor';

/** Everything about Habits the owner can change: the routine and the rules it is scored by. */
export function HabitsSettings() {
  const { loadError } = useSettings();
  const [items, setItems] = useState<HabitItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await habits.items());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const problem = loadError ?? error;
  if (!items) {
    return problem ? (
      <p role="alert" className="text-alert">
        {problem}
      </p>
    ) : (
      <p className="text-sage">Loading your routine…</p>
    );
  }

  return (
    <FadeUp>
      {problem ? (
        <p role="alert" className="mb-6 text-sm text-alert">
          {problem}
        </p>
      ) : null}
      <ItemsEditor items={items} onChanged={reload} />
      <HabitRules />
    </FadeUp>
  );
}
