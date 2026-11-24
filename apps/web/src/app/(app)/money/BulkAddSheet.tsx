'use client';

import { Button } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { ExpensePreview } from '@/components/AskBox';
import { Sheet } from '@/components/Sheet';
import { ai, type ParsedExpense } from '@/lib/ai';

/** Several expenses from a pasted list: read, checked by the person, then added together. */
export function BulkAddSheet({ onClose, onAdded }: { onClose(): void; onAdded(): void }) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<ParsedExpense[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || text.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      setItems((await ai.parseExpenses(text.trim())).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add several" onClose={onClose}>
      {items ? (
        <ExpensePreview items={items} onAdded={onAdded} onCancel={() => setItems(null)} />
      ) : (
        <form onSubmit={read} method="post" noValidate className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm text-sage">
            One on each line, or separated by commas
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder={'tea 20\nrickshaw 60\nlunch 180 bkash'}
              className="w-full rounded-[var(--radius-control)] border border-hairline bg-transparent px-4 py-3 text-base text-ivory placeholder:text-sage/50"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy} className="flex-1">
              Read it
            </Button>
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
