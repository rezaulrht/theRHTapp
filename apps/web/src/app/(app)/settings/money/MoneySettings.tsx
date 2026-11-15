'use client';

import { useCallback, useEffect, useState } from 'react';
import { FadeUp } from '@/components/motion/Stagger';
import { useSettings } from '@/components/SettingsProvider';
import { money, type Account, type Budget, type Category, type Person, type Shortcut } from '@/lib/money';
import { todayInZone } from '@/lib/money-text';
import { AccountsEditor } from './AccountsEditor';
import { BudgetsEditor } from './BudgetsEditor';
import { CategoriesEditor } from './CategoriesEditor';
import { MoneyPreferences } from './MoneyPreferences';
import { PeopleEditor } from './PeopleEditor';
import { ShortcutsEditor } from './ShortcutsEditor';

interface Loaded {
  accounts: Account[];
  categories: Category[];
  shortcuts: Shortcut[];
  budgets: Budget[];
  people: Person[];
}

/** Everything about Money that the owner can change, in one place. */
export function MoneySettings() {
  const { settings, loadError } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const symbol = settings?.['general.currency'].symbol ?? '';
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [accounts, categories, shortcuts, budgets, people] = await Promise.all([
        money.accounts(true),
        money.categories(true),
        money.shortcuts(),
        money.budgets(),
        money.people(true),
      ]);
      setData({ accounts, categories, shortcuts, budgets, people });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const problem = loadError ?? error;
  if (!data || !timeZone) {
    return problem ? (
      <p role="alert" className="text-alert">
        {problem}
      </p>
    ) : (
      <p className="text-sage">Loading your money settings…</p>
    );
  }

  return (
    <FadeUp>
      {problem ? (
        <p role="alert" className="mb-6 text-sm text-alert">
          {problem}
        </p>
      ) : null}
      <AccountsEditor accounts={data.accounts} today={todayInZone(timeZone)} onChanged={reload} />
      <CategoriesEditor categories={data.categories} onChanged={reload} />
      <ShortcutsEditor
        shortcuts={data.shortcuts}
        accounts={data.accounts}
        categories={data.categories}
        onChanged={reload}
      />
      <BudgetsEditor
        // Remount when the set of budgets changes elsewhere (a merge moves budgets).
        key={data.categories.map((category) => category.id).join(',')}
        budgets={data.budgets}
        categories={data.categories}
        onChanged={reload}
      />
      <PeopleEditor people={data.people} symbol={symbol} onChanged={reload} />
      <MoneyPreferences />
    </FadeUp>
  );
}
