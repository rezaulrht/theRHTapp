'use client';

import { Button } from '@pa/ui';
import { useState } from 'react';
import { money, type Entry } from '@/lib/money';
import { dayLabel, formatMoney } from '@/lib/money-text';

const WHY_NOT_EDITABLE: Partial<Record<Entry['kind'], string>> = {
  correction: 'A balance correction cannot be changed. Delete it and fix the balance again if it was wrong.',
  loan: 'Change loans from the Loans page. Delete this one here if it was a mistake.',
};

/** What an entry is, shown when it cannot be edited in the form (a fee, a correction, a loan). */
export function EntrySummary({ entry, symbol }: { entry: Entry; symbol: string }) {
  const explanation = entry.feeOfId
    ? 'This fee belongs to a transfer. Open the transfer to change it.'
    : WHY_NOT_EDITABLE[entry.kind];
  return (
    <div className="mb-6">
      <p className="font-display text-4xl text-ivory tabular-nums">{formatMoney(entry.amount, symbol)}</p>
      <p className="mt-2 text-ivory">{entry.name}</p>
      <p className="text-sm text-sage">{dayLabel(entry.date)}</p>
      {entry.note ? <p className="mt-3 text-sm text-sage">{entry.note}</p> : null}
      {explanation ? <p className="mt-4 max-w-prose text-sm text-sage">{explanation}</p> : null}
    </div>
  );
}

/** Delete, with one confirmation, because it cannot be undone. */
export function DeleteEntry({ entry, onDeleted }: { entry: Entry; onDeleted(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await money.deleteEntry(entry.id);
      onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete. Try again.');
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="mt-6 border-t border-hairline pt-4">
        <Button variant="quiet" className="-ml-6 text-alert hover:text-alert" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-hairline pt-4">
      <p className="text-sm text-ivory">
        {entry.fee ? 'Delete this transfer and its fee?' : 'Delete this entry?'} This cannot be undone.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="outline" loading={busy} onClick={remove} className="border-alert text-alert">
          Yes, delete it
        </Button>
        <Button variant="quiet" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
