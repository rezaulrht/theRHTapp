'use client';

import { Button } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { Sheet } from '@/components/Sheet';
import { ai, type ProposedItem } from '@/lib/ai';
import { habits, pointsText } from '@/lib/habits';
import { timingSummary } from './ItemsEditor';

/** Describe an ideal day, pick which of the suggested habits to keep, and add them to the routine. */
export function RoutineBuilder({ onClose, onAdded }: { onClose(): void; onAdded(): void }) {
  const [description, setDescription] = useState('');
  const [proposed, setProposed] = useState<ProposedItem[] | null>(null);
  const [kept, setKept] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || description.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const { items } = await ai.routine(description.trim());
      setProposed(items);
      setKept(items.map(() => true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function addSelected() {
    if (busy || !proposed) return;
    setBusy(true);
    setError(null);
    let added = 0;
    try {
      for (const [index, item] of proposed.entries()) {
        if (!kept[index]) continue;
        await habits.createItem({ ...item, lateShare: null, missMultiplier: null, ignoreQuietHours: false });
        added += 1;
      }
      onAdded();
    } catch (caught) {
      setError(`${added > 0 ? `${added} added. ` : ''}${caught instanceof Error ? caught.message : 'Could not save. Try again.'}`);
    } finally {
      setBusy(false);
    }
  }

  const count = kept.filter(Boolean).length;

  return (
    <Sheet title="Build a routine" onClose={onClose}>
      {proposed ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-sage">Untick anything you do not want. Nothing is added until you press the button.</p>
          <ul aria-label="Suggested habits" className="divide-y divide-hairline border-y border-hairline">
            {proposed.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={kept[index] ?? false}
                    onChange={() => setKept(kept.map((value, position) => (position === index ? !value : value)))}
                    className="size-5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ivory">{item.name}</span>
                    <span className="block truncate text-sm text-sage">{timingSummary(item.timing)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-sage">{pointsText(item.points)}</span>
                </label>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className="text-sm text-alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button onClick={() => void addSelected()} loading={busy} disabled={count === 0} className="flex-1">
              {`Add ${count} to the routine`}
            </Button>
            <Button variant="quiet" onClick={() => setProposed(null)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={suggest} method="post" noValidate className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm text-sage">
            Describe your ideal day, with times
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              placeholder="Up for Fajr, gym at 7am on weekdays, read 20 minutes before bed, drink 8 glasses of water through the day"
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
              Suggest habits
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
