'use client';

import { pointsText, type DayItem } from '@/lib/habits';
import { outcomeText, timeText, windowText } from '@/lib/habits-text';

const tone: Record<DayItem['outcome'], string> = {
  onTime: 'text-brass',
  late: 'text-ivory',
  missed: 'text-alert',
  skipped: 'text-sage',
  pending: 'text-sage',
};

/** The time an item belongs at on the timeline, or null when it can be done any time. */
export function railTime(item: DayItem, timeZone: string): { time: string; half: string } | null {
  if (windowText(item, timeZone).startsWith('Any time')) return null;
  const [time = '', half = ''] = timeText(item.opensAt ?? item.dueAt, timeZone).split(' ');
  return { time, half };
}

/**
 * One thing on the routine, on the timeline. The round button is the whole
 * point: one tap ticks it. Tapping the name opens the choices to correct the
 * time, undo or skip.
 */
export function ItemRow({
  item,
  timeZone,
  busy,
  isNext,
  onTick,
  onMore,
}: {
  item: DayItem;
  timeZone: string;
  busy: boolean;
  /** The next thing due: it is picked out so it is found at a glance. */
  isNext: boolean;
  onTick(): void;
  onMore(): void;
}) {
  const repeating = item.target !== null;
  const done = item.outcome === 'onTime' || item.outcome === 'late';
  // A finished one-off item is not ticked twice; tapping it opens its choices instead.
  const ticksAgain = repeating || item.marks.length === 0;
  const label = item.skipped
    ? `${item.name}, skipped`
    : ticksAgain
      ? repeating
        ? `Add one for ${item.name}`
        : `Mark ${item.name} done`
      : `${item.name}, done. Change it`;
  const result = outcomeText(item.outcome);
  const lastMark = item.marks.at(-1);
  // A finished one-off item shows when it was done; anything else shows its window.
  const detail = done && !repeating && lastMark ? `at ${timeText(lastMark.at, timeZone)}` : windowText(item, timeZone);
  const rail = railTime(item, timeZone);
  const settled = done || item.outcome === 'skipped';

  return (
    <div
      className={`grid grid-cols-[3.25rem_auto_1fr_auto] items-center gap-x-3 rounded-[var(--radius-control)] py-2 pr-2 transition-colors duration-200 sm:grid-cols-[4.5rem_auto_1fr_auto] sm:gap-x-4 ${
        isNext ? 'bg-brass/10 ring-1 ring-brass/50' : ''
      }`}
    >
      <p className="pl-2 text-right leading-tight tabular-nums sm:pl-3">
        {rail ? (
          <>
            <span className={`block font-display text-lg ${settled ? 'text-sage' : 'text-ivory'}`}>{rail.time}</span>
            <span className="block text-xs text-sage">{rail.half}</span>
          </>
        ) : (
          <span className="block text-xs text-sage">Any time</span>
        )}
      </p>

      <button
        type="button"
        aria-label={label}
        aria-pressed={repeating ? undefined : item.marks.length > 0}
        disabled={busy || item.skipped}
        onClick={ticksAgain ? onTick : onMore}
        className={`grid size-12 shrink-0 place-items-center rounded-full border transition-[transform,background-color,border-color] duration-200 active:scale-90 disabled:opacity-50 ${
          done
            ? 'border-brass bg-brass text-ground'
            : item.marks.length > 0 || isNext
              ? 'border-brass text-brass'
              : 'border-hairline text-sage hover:border-brass hover:text-brass'
        }`}
      >
        {repeating ? (
          <span className="font-display text-lg tabular-nums">{item.marks.length}</span>
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.marks.length > 0 ? <path d="M3 8.5l3.2 3.2L13 4.8" pathLength={1} className="draw-in" /> : null}
          </svg>
        )}
      </button>

      <button
        type="button"
        aria-label={`More for ${item.name}`}
        onClick={onMore}
        className="min-h-12 min-w-0 rounded-[var(--radius-control)] py-1 text-left transition-colors duration-150 hover:bg-brass/5"
      >
        <span className={`block truncate ${item.skipped ? 'text-sage line-through' : settled ? 'text-sage' : 'text-ivory'}`}>
          {item.name}
        </span>
        <span className="block truncate text-sm text-sage">
          {result ? <span className={tone[item.outcome]}>{result}</span> : null}
          {result && detail ? ' · ' : null}
          {detail}
        </span>
      </button>

      {/* Points matter once they are won or lost; before that every row would say the same thing. */}
      {item.outcome === 'pending' || item.outcome === 'skipped' ? (
        <span />
      ) : (
        <p className={`font-display text-lg tabular-nums ${tone[item.outcome]}`}>{pointsText(item.score, true)}</p>
      )}
    </div>
  );
}
