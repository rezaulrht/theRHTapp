'use client';

import type { Shortcut } from '@/lib/money';
import { formatMoney } from '@/lib/money-text';

/**
 * Saved expenses, one tap each. The small button beside each opens the form
 * filled in, for a day when the fare was different.
 */
export function ShortcutBar({
  shortcuts,
  symbol,
  busyId,
  onUse,
  onAdjust,
}: {
  shortcuts: Shortcut[];
  symbol: string;
  busyId: string | null;
  onUse(shortcut: Shortcut): void;
  onAdjust(shortcut: Shortcut): void;
}) {
  const usable = shortcuts.filter((shortcut) => shortcut.usable);
  if (usable.length === 0) return null;

  return (
    <section aria-label="Shortcuts" className="-mx-5 mb-8 overflow-x-auto px-5 md:mx-0 md:px-0" data-lenis-prevent>
      <ul className="flex min-w-max gap-2 pb-1">
        {usable.map((shortcut) => (
          <li
            key={shortcut.id}
            className="flex items-stretch overflow-hidden rounded-full border border-hairline transition-colors duration-200 hover:border-brass"
          >
            <button
              type="button"
              onClick={() => onUse(shortcut)}
              disabled={busyId === shortcut.id}
              aria-busy={busyId === shortcut.id || undefined}
              className="flex min-h-11 items-center gap-2 pl-4 pr-3 text-sm text-ivory transition-[transform,opacity] duration-150 active:scale-95 disabled:opacity-50"
            >
              {shortcut.name}{' '}
              <span className="font-display text-brass tabular-nums">{formatMoney(shortcut.amount, symbol)}</span>
            </button>
            <button
              type="button"
              onClick={() => onAdjust(shortcut)}
              aria-label={`Change the amount for ${shortcut.name}`}
              className="flex min-h-11 w-9 items-center justify-center border-l border-hairline text-sage transition-colors duration-150 hover:text-ivory"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <circle cx="3" cy="8" r="1.3" />
                <circle cx="8" cy="8" r="1.3" />
                <circle cx="13" cy="8" r="1.3" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
