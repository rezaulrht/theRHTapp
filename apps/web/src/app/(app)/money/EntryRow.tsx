'use client';

import { CATEGORY_COLORS } from '@pa/shared/categories';
import type { Category, Entry } from '@/lib/money';
import { formatMoney, shortDay } from '@/lib/money-text';

export function categoryDot(color: string | undefined): string {
  return (color && CATEGORY_COLORS[color as keyof typeof CATEGORY_COLORS]) || 'var(--color-sage)';
}

/** One line of the notebook: what it was, where it came from, how much. */
export function EntryRow({
  entry,
  accountName,
  category,
  symbol,
  showDate = false,
  onOpen,
}: {
  entry: Entry;
  accountName: string;
  category?: Category;
  symbol: string;
  /** Lists that span more than a day show which day each entry belongs to. */
  showDate?: boolean;
  onOpen?(): void;
}) {
  const incoming =
    entry.kind === 'income' ||
    (entry.kind === 'loan' && (entry.loanDirection === 'borrowed' || entry.loanDirection === 'repaid_to_me'));
  const tone = incoming
    ? 'text-brass'
    : entry.kind === 'transfer' || entry.kind === 'correction'
      ? 'text-sage'
      : 'text-ivory';

  const content = (
    <>
      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: categoryDot(category?.color) }} />
      <span className="min-w-0">
        <span data-entry-name className="block truncate text-ivory">
          {entry.name}
        </span>
        <span className="flex flex-wrap gap-x-2 text-sm text-sage">
          {showDate ? <span>{shortDay(entry.date)}</span> : null}
          <span>{accountName}</span>
          {category ? <span className="opacity-70">{category.name}</span> : null}
        </span>
      </span>
      <span className={`font-display text-lg tabular-nums ${tone}`}>
        {incoming ? '+' : ''}
        {formatMoney(entry.amount, symbol)}
      </span>
    </>
  );
  const layout = 'grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 py-3.5 text-left';

  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${layout} transition-colors duration-150 hover:bg-ivory/[0.03]`}>
      {content}
    </button>
  ) : (
    <div className={layout}>{content}</div>
  );
}
