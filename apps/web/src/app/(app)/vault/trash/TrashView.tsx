'use client';

import { Button } from '@pa/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { useSettings } from '@/components/SettingsProvider';
import { vault, type TrashEntry } from '@/lib/vault';
import { removeText, trashContentsText } from '@/lib/vault-text';
import { KindIcon } from '../_parts/KindIcon';

/** What was deleted, how long it stays, and ways to bring it back or empty the trash now. */
export function TrashView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'] ?? 'Asia/Dhaka';
  const days = settings?.['vault.trashDays'];
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await vault.trash());
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(entry: TrashEntry) {
    setBusy(entry.id);
    try {
      await vault.restore(entry.id);
      setMessage(`${entry.name} is back.`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not restore. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function empty() {
    setBusy('empty');
    try {
      const result = await vault.emptyTrash();
      setMessage(
        result.left === 0
          ? 'The trash is empty.'
          : `Emptied, except ${result.left} that could not be removed from storage. It will be tried again.`,
      );
      setConfirming(false);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not empty the trash. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="mb-2 font-display text-4xl leading-tight text-ivory md:text-5xl">
        <Reveal>Trash</Reveal>
      </h1>
      <p className="mb-8 max-w-prose text-sage">
        Deleted things stay here{days ? ` for ${days} days` : ''}, then are removed for good, files included.
      </p>

      {message ? (
        <p role="status" className="mb-4 text-sm text-brass">
          {message}
        </p>
      ) : null}

      {entries === null ? (
        <p className="text-sage">Opening…</p>
      ) : entries.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">The trash is empty.</p>
      ) : (
        <>
          <ul aria-label="In the trash" className="border-t border-hairline">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className="flex items-center gap-3 border-b border-hairline py-3"
                >
                  <KindIcon kind={entry.kind} className="shrink-0 text-sage" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ivory">{entry.name}</span>
                    <span className="block text-sm text-sage">
                      {[trashContentsText(entry.folders, entry.items), removeText(entry.removeAt, timeZone)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Button variant="outline" loading={busy === entry.id} onClick={() => void restore(entry)} aria-label={`Restore ${entry.name}`}>
                    Restore
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <div className="mt-8">
            {confirming ? (
              <div className="max-w-md rounded-[var(--radius-control)] border border-alert/60 p-4">
                <p className="text-sm text-ivory">
                  Remove everything in the trash for good, with its stored files? This cannot be undone.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Button variant="outline" className="border-alert text-alert" loading={busy === 'empty'} onClick={() => void empty()}>
                    Yes, empty the trash
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="quiet" className="-ml-6 text-alert hover:text-alert" onClick={() => setConfirming(true)}>
                Empty trash
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
