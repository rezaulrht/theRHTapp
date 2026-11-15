'use client';

import { Button, Field } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { Sheet } from '@/components/Sheet';
import { habits, pointsText, type DayItem, type DayReport } from '@/lib/habits';
import { instantOn, outcomeText, timeInputValue, timeText, windowText } from '@/lib/habits-text';

/**
 * The choices for one item on one day: correct when it was done, undo the
 * tick, or skip it for the day.
 */
export function MarkSheet({
  item,
  day,
  timeZone,
  dayEndHour,
  onChanged,
  onClose,
}: {
  item: DayItem;
  day: string;
  timeZone: string;
  dayEndHour: number;
  onChanged(report: DayReport): void;
  onClose(): void;
}) {
  // For a repeating item the choices act on the newest tick.
  const mark = item.marks[item.marks.length - 1];
  const [time, setTime] = useState(mark ? timeInputValue(mark.at, timeZone) : '');
  const [busy, setBusy] = useState<'time' | 'undo' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'time' | 'undo' | 'skip', work: () => Promise<DayReport>) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      onChanged(await work());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
      setBusy(null);
    }
  }

  function saveTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mark || !time) return;
    void run('time', () => habits.moveMark(mark.id, instantOn(day, time, timeZone, dayEndHour).toISOString()));
  }

  const result = outcomeText(item.outcome);

  return (
    <Sheet title={item.name} onClose={onClose}>
      <p className="text-sage">
        {windowText(item, timeZone)}
        {result ? ` · ${result}` : ''}
        {item.outcome !== 'pending' && item.outcome !== 'skipped' ? ` · ${pointsText(item.score, true)}` : ''}
      </p>

      {mark && !item.skipped ? (
        <form onSubmit={saveTime} method="post" noValidate className="mt-6 flex items-end gap-3">
          <Field
            className="flex-1 [color-scheme:dark]"
            label="Done at"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            hint={`Recorded at ${timeText(mark.at, timeZone)}. Change it if you ticked it later than you did it.`}
          />
          <Button type="submit" variant="outline" loading={busy === 'time'} className="mb-[3.25rem]">
            Save time
          </Button>
        </form>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        {mark && !item.skipped ? (
          <Button variant="quiet" loading={busy === 'undo'} onClick={() => void run('undo', () => habits.removeMark(mark.id))}>
            {item.target !== null ? 'Undo the last one' : 'Undo'}
          </Button>
        ) : null}
        {item.skipped ? (
          <Button variant="quiet" loading={busy === 'skip'} onClick={() => void run('skip', () => habits.unskipItem(day, item.itemId))}>
            Put it back
          </Button>
        ) : (
          <Button variant="quiet" loading={busy === 'skip'} onClick={() => void run('skip', () => habits.skipItem(day, item.itemId))}>
            Skip for this day
          </Button>
        )}
        <Button variant="quiet" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </div>
      {item.skipped ? null : (
        <p className="mt-3 text-xs text-sage">A skipped item scores nothing and does not break its streak.</p>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
