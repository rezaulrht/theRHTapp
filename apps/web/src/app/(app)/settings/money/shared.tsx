'use client';

import { Button } from '@pa/ui';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { ApiError, type FieldError } from '@/lib/api';

/**
 * One request made from a row: whether it is running, whether it worked, and
 * the server's complaints by field.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setDone(false);
    setErrors([]);
    setMessage(null);
    try {
      await work();
      setDone(true);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.errors?.length) setErrors(caught.errors);
      else setMessage(caught instanceof Error ? caught.message : 'Could not save. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const errorAt = useCallback((path: string) => errors.find((error) => error.path === path)?.message, [errors]);

  /** Everything no field claimed, so nothing is silently dropped. */
  const problems = useCallback(
    (shown: string[]) => [
      ...(message ? [message] : []),
      ...errors.filter((error) => !shown.includes(error.path)).map((error) => error.message),
    ],
    [errors, message],
  );

  const fail = useCallback((text: string) => setMessage(text), []);
  const touch = useCallback(() => setDone(false), []);

  return { busy, done, run, errorAt, problems, fail, touch };
}

/** A titled part of the page that tests and screen readers can find by name. */
export function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <h2 id={id} className="font-display text-2xl text-ivory">
        {title}
      </h2>
      {intro ? <p className="mt-2 max-w-prose text-sage">{intro}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** "Saved", with the tick that draws itself. */
export function SavedNote({ show }: { show: boolean }) {
  return (
    <span role="status" className="flex items-center gap-1.5 text-sm text-brass">
      {show ? (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5l3.2 3.2L13 4.8" pathLength={1} className="draw-in" />
          </svg>
          Saved
        </>
      ) : (
        ''
      )}
    </span>
  );
}

export function Problems({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <div role="alert" className="mt-2 text-sm text-alert">
      {list.map((problem) => (
        <p key={problem}>{problem}</p>
      ))}
    </div>
  );
}

/** Up and down, for putting a list in the owner's order. */
export function MoveButtons({
  name,
  index,
  count,
  disabled,
  onMove,
}: {
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove(by: -1 | 1): void;
}) {
  const button =
    'grid size-11 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-ivory disabled:opacity-30';
  return (
    <span className="flex">
      <button
        type="button"
        aria-label={`Move ${name} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        className={button}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 10l5-5 5 5" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={`Move ${name} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        className={button}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>
    </span>
  );
}

/** A question asked before anything that hides or removes something. */
export function Confirm({
  question,
  yes,
  no,
  busy,
  onYes,
  onNo,
}: {
  question: string;
  yes: string;
  no: string;
  busy: boolean;
  onYes(): void;
  onNo(): void;
}) {
  return (
    <div className="mt-3 rounded-[var(--radius-control)] border border-hairline p-4">
      <p className="text-sm text-ivory">{question}</p>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="outline" loading={busy} onClick={onYes} className="border-alert text-alert">
          {yes}
        </Button>
        <Button variant="quiet" onClick={onNo}>
          {no}
        </Button>
      </div>
    </div>
  );
}

/** The new order of ids after moving one item up or down. */
export function moved<T extends { id: string }>(items: T[], index: number, by: -1 | 1): string[] {
  const ids = items.map((item) => item.id);
  const target = index + by;
  if (target < 0 || target >= ids.length) return ids;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids;
}

export const rowClass = 'border-b border-hairline py-5';
