'use client';

import { Button, Field } from '@pa/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { ai, type AskAnswer, type ParsedExpense } from '@/lib/ai';
import { money, type Account, type Category } from '@/lib/money';
import { formatMoney } from '@/lib/money-text';
import { useSettings } from './SettingsProvider';
import { useAssistant } from './useAssistant';

/** Expenses the assistant read, with the account and category each will use, for the person to confirm. */
export function ExpensePreview({
  items,
  onAdded,
  onCancel,
}: {
  items: ParsedExpense[];
  onAdded(count: number): void;
  onCancel(): void;
}) {
  const { settings } = useSettings();
  const symbol = settings?.['general.currency'].symbol ?? '';
  const [rows, setRows] = useState(items);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([money.accounts(), money.categories()])
      .then(([loadedAccounts, loadedCategories]) => {
        setAccounts(loadedAccounts);
        setCategories(loadedCategories.filter((category) => !category.isFees));
      })
      .catch(() => setError('Could not load your accounts and categories.'));
  }, []);

  const fallbackAccount = accounts[0]?.id;
  const fallbackCategory = categories[0]?.id;
  const nameOf = <T extends { id: string; name: string }>(list: T[], id: string | null, fallback: string | undefined) =>
    list.find((entry) => entry.id === (id ?? fallback))?.name ?? '';

  async function addAll() {
    if (busy || !fallbackAccount || !fallbackCategory) return;
    setBusy(true);
    setError(null);
    let added = 0;
    try {
      for (const row of rows) {
        await money.createEntry({
          kind: 'expense',
          name: row.name,
          amount: row.amount,
          accountId: row.accountId ?? fallbackAccount,
          categoryId: row.categoryId ?? fallbackCategory,
          date: row.date,
        });
        added += 1;
        // Each one is taken off the list as it is saved, so a failure part-way never adds anything twice.
        setRows((current) => current.slice(1));
      }
      onAdded(added);
    } catch (caught) {
      setError(
        `${added > 0 ? `${added} added. ` : ''}${caught instanceof Error ? caught.message : 'Could not save. Try again.'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-hairline p-4">
      <p className="text-sm text-sage">Check these, then add them. Nothing is saved yet.</p>
      <ul aria-label="Expenses to add" className="mt-3 divide-y divide-hairline">
        {rows.map((row, index) => (
          <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-ivory">{row.name}</p>
              <p className="truncate text-sm text-sage">
                {nameOf(categories, row.categoryId, fallbackCategory)} · {nameOf(accounts, row.accountId, fallbackAccount)} · {row.date}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-ivory">{formatMoney(row.amount, symbol)}</span>
              <button
                type="button"
                aria-label={`Leave out ${row.name}`}
                onClick={() => setRows(rows.filter((_, position) => position !== index))}
                className="grid size-9 place-items-center rounded-full text-sage transition-colors hover:text-alert"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void addAll()} loading={busy} disabled={rows.length === 0 || !fallbackAccount || !fallbackCategory}>
          {`Add ${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'}`}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * One box for questions about money and habits, spending typed in, and
 * reminders to set. It says which it understood and asks before it changes
 * anything. Hidden until the assistant is set up.
 */
export function AskBox({
  scope = 'all',
  placeholder = 'Ask, add spending, or set a reminder',
  onAdded,
}: {
  scope?: 'all' | 'money' | 'habits';
  placeholder?: string;
  onAdded?(): void;
}) {
  const enabled = useAssistant();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!enabled) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || text.trim() === '') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setAnswer(null);
    try {
      setAnswer(await ai.ask(text.trim(), scope));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function finish(message: string) {
    setAnswer(null);
    setText('');
    setNotice(message);
    onAdded?.();
  }

  async function setReminder(reminder: Extract<AskAnswer, { type: 'reminder' }>) {
    setBusy(true);
    setError(null);
    try {
      await ai.createReminder(reminder.title, reminder.at);
      finish(`Reminder set for ${reminder.whenText}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set the reminder. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Assistant" className="mb-8">
      <form onSubmit={submit} method="post" noValidate className="flex items-end gap-2">
        <Field
          label="Ask"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="flex-1"
        />
        <Button type="submit" loading={busy}>
          Go
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-brass">
          {notice}
        </p>
      ) : null}

      {answer?.type === 'answer' ? (
        <p role="status" className="mt-4 max-w-prose whitespace-pre-line rounded-[var(--radius-control)] border border-hairline p-4 text-ivory">
          {answer.text}
        </p>
      ) : null}

      {answer?.type === 'expense' ? (
        <div className="mt-4">
          <ExpensePreview
            items={answer.items}
            onAdded={(count) => finish(`${count} ${count === 1 ? 'expense' : 'expenses'} added.`)}
            onCancel={() => setAnswer(null)}
          />
        </div>
      ) : null}

      {answer?.type === 'reminder' ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-hairline p-4">
          <p className="text-sm text-sage">Set this reminder?</p>
          <p className="mt-1 text-ivory">{answer.title}</p>
          <p className="text-sm text-brass">{answer.whenText}</p>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => void setReminder(answer)} loading={busy}>
              Set reminder
            </Button>
            <Button variant="quiet" onClick={() => setAnswer(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
