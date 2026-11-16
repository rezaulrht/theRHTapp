'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { EASE_OUT } from '@/components/motion/ease';
import type { VaultFolder, VaultItem } from '@/lib/vault';
import { itemMeta } from '@/lib/vault-text';
import { KindIcon } from './KindIcon';

export interface Selection {
  folders: string[];
  items: string[];
}

/**
 * Folders, then items, each a link to open it. With `selection` given, each
 * row also has a tick box for moving or deleting several at once.
 */
export function EntryList({
  label,
  folders,
  items,
  showPath = false,
  selection,
  onSelect,
}: {
  label: string;
  folders: VaultFolder[];
  items: VaultItem[];
  /** Lists that gather things from many folders say where each one is. */
  showPath?: boolean;
  selection?: Selection;
  onSelect?(next: Selection): void;
}) {
  const rows = [
    ...folders.map((folder) => ({ kind: 'folder' as const, id: folder.id, name: folder.name, href: `/vault/f/${folder.id}`, meta: showPath ? folder.path.slice(0, -1).map((step) => step.name).join(' › ') : '', pinned: folder.pinned })),
    ...items.map((item) => ({
      kind: item.kind,
      id: item.id,
      name: item.name,
      href: `/vault/i/${item.id}`,
      meta: [showPath ? item.path.map((step) => step.name).join(' › ') : '', itemMeta(item)].filter(Boolean).join(' · '),
      pinned: item.pinned,
    })),
  ];

  const toggle = (kind: 'folder' | 'item', id: string) => {
    if (!selection || !onSelect) return;
    const key = kind === 'folder' ? 'folders' : 'items';
    const list = selection[key];
    onSelect({ ...selection, [key]: list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id] });
  };

  return (
    <ul aria-label={label} className="border-t border-hairline">
      {rows.map((row, index) => {
        const group = row.kind === 'folder' ? 'folders' : 'items';
        const chosen = selection?.[group].includes(row.id) ?? false;
        return (
          <motion.li
            key={`${row.kind}:${row.id}`}
            className={`flex items-center gap-1 border-b border-hairline transition-colors duration-150 ${chosen ? 'bg-brass/[0.07]' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: Math.min(index, 12) * 0.03 }}
          >
            {selection ? (
              <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  checked={chosen}
                  onChange={() => toggle(row.kind === 'folder' ? 'folder' : 'item', row.id)}
                  className="size-4 accent-[var(--color-brass)]"
                />
              </label>
            ) : null}
            <Link
              href={row.href}
              className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 transition-colors duration-150 hover:text-brass"
            >
              <KindIcon kind={row.kind} className={row.kind === 'folder' ? 'shrink-0 text-brass' : 'shrink-0 text-sage group-hover:text-brass'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ivory group-hover:text-brass">
                  {row.name}
                  {row.pinned ? <span className="sr-only"> (pinned)</span> : null}
                </span>
                {row.meta ? <span className="block truncate text-sm text-sage">{row.meta}</span> : null}
              </span>
              {row.pinned ? (
                <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" className="shrink-0 text-brass" fill="currentColor">
                  <path d="M8 1l2 4.5 4.5.5-3.4 3 1 4.6L8 11.3 3.9 13.6l1-4.6L1.5 6l4.5-.5z" />
                </svg>
              ) : null}
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
