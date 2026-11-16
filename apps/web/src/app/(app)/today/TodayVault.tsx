'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SpotlightPanel } from '@/components/motion/SpotlightPanel';
import { useSettings } from '@/components/SettingsProvider';
import { timeText } from '@/lib/habits-text';
import { dayLabel } from '@/lib/money-text';
import { vault, type CalendarEntry, type VaultFolder, type VaultItem } from '@/lib/vault';
import { KindIcon } from '../vault/_parts/KindIcon';

/** The Vault's block on the Today page: pinned folders and items, and what is coming up this week. */
export function TodayVault() {
  const { settings } = useSettings();
  const [data, setData] = useState<{ pinned: { folders: VaultFolder[]; items: VaultItem[] }; upcoming: CalendarEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeZone = settings?.['general.timezone'];

  useEffect(() => {
    vault
      .today()
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'));
  }, []);

  const pins = data ? [...data.pinned.folders.map((folder) => ({ ...folder, kind: 'folder' as const })), ...data.pinned.items] : [];

  return (
    <SpotlightPanel className="flex h-full flex-col">
      <h2 className="font-display text-2xl text-ivory">
        <Link href="/vault" className="hover:text-brass">
          Vault
        </Link>
      </h2>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <p className="mt-4 text-sm text-sage">Pinned</p>
          {pins.length === 0 ? (
            <p className="mt-1 text-sm text-sage/80">Pin a folder or file to keep it here.</p>
          ) : (
            <ul aria-label="Pinned in the Vault" className="mt-2 flex flex-col gap-1">
              {pins.slice(0, 5).map((pin) => (
                <li key={pin.id}>
                  <Link
                    href={pin.kind === 'folder' ? `/vault/f/${pin.id}` : `/vault/i/${pin.id}`}
                    className="flex items-center gap-2 text-ivory transition-colors duration-150 hover:text-brass"
                  >
                    <KindIcon kind={pin.kind} className="shrink-0 text-brass" />
                    <span className="truncate">{pin.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 border-t border-hairline pt-4 text-sm text-sage">Coming up</p>
          {data.upcoming.length === 0 ? (
            <p className="mt-1 text-sm text-sage/80">Nothing in the next week.</p>
          ) : (
            <ul aria-label="Coming up in the Vault" className="mt-2 flex flex-col gap-1.5 text-sm">
              {data.upcoming.map((entry) => (
                <li key={`${entry.kind}:${entry.title}:${entry.date}:${entry.at ?? ''}`}>
                  <Link href={entry.link} className="flex justify-between gap-3 transition-colors duration-150 hover:text-brass">
                    <span className="truncate text-ivory">{entry.title}</span>
                    <span className="shrink-0 text-sage">
                      {dayLabel(entry.date).split(',')[0]}
                      {entry.at && timeZone ? ` ${timeText(entry.at, timeZone)}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : error ? null : (
        <p className="mt-4 text-sm text-sage">Opening the Vault…</p>
      )}
    </SpotlightPanel>
  );
}
