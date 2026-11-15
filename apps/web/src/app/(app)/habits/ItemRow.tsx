'use client';

import { pointsText, type DayItem } from '@/lib/habits';
import { outcomeText, windowText } from '@/lib/habits-text';

const tone: Record<DayItem['outcome'], string> = {
  onTime: 'text-brass',
  late: 'text-ivory',
  missed: 'text-alert',
  skipped: 'text-sage',
  pending: 'text-sage',
};

/**
 * One thing on the routine. The round button is the whole point: one tap
 * ticks it. The dots open the choices to correct the time, undo or skip.
 */
export function ItemRow({
  item,
  timeZone,
  busy,
  onTick,
  onMore,
}: {
  item: DayItem;
  timeZone: string;
  busy: boolean;
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

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 py-3">
      <button
        type="button"
        aria-label={label}
        aria-pressed={repeating ? undefined : item.marks.length > 0}
        disabled={busy || item.skipped}
        onClick={ticksAgain ? onTick : onMore}
        className={`grid size-12 place-items-center rounded-full border transition-[transform,background-color,border-color] duration-200 active:scale-90 disabled:opacity-50 ${
          done
            ? 'border-brass bg-brass text-ground'
            : item.marks.length > 0
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

      <div className="min-w-0">
        <p className={`truncate ${item.skipped ? 'text-sage line-through' : 'text-ivory'}`}>{item.name}</p>
        <p className="text-sm text-sage">{windowText(item, timeZone)}</p>
      </div>

      <div className="text-right">
        {result ? <p className={`text-sm ${tone[item.outcome]}`}>{result}</p> : null}
        <p className={`font-display text-lg tabular-nums ${item.outcome === 'pending' ? 'text-sage/60' : tone[item.outcome]}`}>
          {item.outcome === 'pending' || item.outcome === 'skipped' ? pointsText(item.points) : pointsText(item.score, true)}
        </p>
      </div>

      <button
        type="button"
        aria-label={`More for ${item.name}`}
        onClick={onMore}
        className="grid size-11 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-ivory"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="8" cy="13" r="1.3" />
        </svg>
      </button>
    </div>
  );
}
