'use client';

import { Sheet } from '@/components/Sheet';
import type { Account, Category, Entry } from '@/lib/money';
import { DeleteEntry, EntrySummary } from './EntryDetails';
import { EntryForm } from './EntryForm';

/** Kinds the entry form can edit. Loans, corrections and fees are shown, not edited. */
function editableInForm(entry: Entry): boolean {
  return entry.feeOfId === null && (entry.kind === 'expense' || entry.kind === 'income' || entry.kind === 'transfer');
}

/** An existing entry, opened: change it where that is allowed, or delete it. */
export function EntrySheet({
  entry,
  accounts,
  categories,
  symbol,
  today,
  onClose,
  onChanged,
}: {
  entry: Entry;
  accounts: Account[];
  categories: Category[];
  symbol: string;
  today: string;
  onClose(): void;
  onChanged(): void;
}) {
  const editable = editableInForm(entry);
  return (
    <Sheet title={editable ? 'Edit entry' : entry.name} onClose={onClose}>
      {editable ? (
        <EntryForm
          accounts={accounts}
          categories={categories}
          initial={entry}
          defaultDate={entry.date}
          maxDate={today}
          onSaved={onChanged}
          onCancel={onClose}
        />
      ) : (
        <EntrySummary entry={entry} symbol={symbol} />
      )}
      <DeleteEntry entry={entry} onDeleted={onChanged} />
    </Sheet>
  );
}
