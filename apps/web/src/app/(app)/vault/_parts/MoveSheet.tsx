'use client';

import { Button } from '@pa/ui';
import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { ROOT, vault, type FolderContents } from '@/lib/vault';
import { Breadcrumbs } from './Breadcrumbs';
import { KindIcon } from './KindIcon';
import type { Selection } from './EntryList';

/**
 * Pick where to move things: walk into folders and choose "Move here". The
 * folders being moved are not offered, so nothing can go inside itself.
 */
export function MoveSheet({
  selection,
  fromId,
  onMoved,
  onClose,
}: {
  selection: Selection;
  /** Where the things are now; moving there would change nothing. */
  fromId: string;
  onMoved(): void;
  onClose(): void;
}) {
  const [at, setAt] = useState<string>(ROOT);
  const [contents, setContents] = useState<FolderContents | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = selection.folders.length + selection.items.length;

  useEffect(() => {
    let current = true;
    setContents(null);
    vault
      .folder(at)
      .then((loaded) => current && setContents(loaded))
      .catch((caught: unknown) => current && setError(caught instanceof Error ? caught.message : 'Could not load.'));
    return () => {
      current = false;
    };
  }, [at]);

  async function move() {
    setBusy(true);
    setError(null);
    try {
      await vault.move(selection.folders, selection.items, at === ROOT ? null : at);
      onMoved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move. Try again.');
      setBusy(false);
    }
  }

  const choices = contents?.folders.filter((folder) => !selection.folders.includes(folder.id)) ?? [];

  return (
    <Sheet title={`Move ${count} ${count === 1 ? 'thing' : 'things'}`} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        {at !== ROOT ? (
          <button
            type="button"
            onClick={() => setAt(contents?.folder?.parentId ?? ROOT)}
            className="text-sm text-sage hover:text-ivory"
          >
            ‹ Up
          </button>
        ) : null}
      </div>
      <Breadcrumbs path={contents?.folder?.path ?? []} />

      {contents === null ? (
        <p className="py-6 text-sage">Loading…</p>
      ) : choices.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sm text-sage">No folders in here.</p>
      ) : (
        <ul aria-label="Folders to move into" className="max-h-[45dvh] overflow-y-auto border-t border-hairline" data-lenis-prevent>
          {choices.map((folder) => (
            <li key={folder.id} className="border-b border-hairline">
              <button
                type="button"
                onClick={() => setAt(folder.id)}
                className="flex min-h-12 w-full items-center gap-3 text-left text-ivory transition-colors duration-150 hover:text-brass"
              >
                <KindIcon kind="folder" className="text-brass" />
                <span className="truncate">{folder.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => void move()} loading={busy} disabled={at === fromId} className="flex-1">
          {at === ROOT ? 'Move to the top level' : `Move into ${contents?.folder?.name ?? 'this folder'}`}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
