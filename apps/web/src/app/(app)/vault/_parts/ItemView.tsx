'use client';

import { Button, Field } from '@pa/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FadeUp } from '@/components/motion/Stagger';
import { Reveal } from '@/components/motion/Reveal';
import { ApiError } from '@/lib/api';
import { vault, type VaultItem } from '@/lib/vault';
import { kindText } from '@/lib/vault-text';
import { Breadcrumbs } from './Breadcrumbs';
import { FieldValues } from './FieldValues';
import { FileViewer } from './FileViewer';
import { MoveSheet } from './MoveSheet';
import { NameSheet } from './NameSheet';
import { NoteEditor } from './NoteEditor';
import { RemindersPanel } from './RemindersPanel';
import { TagPicker } from './TagPicker';

function LinkPanel({ item, onSaved }: { item: VaultItem; onSaved(next: VaultItem): void }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(item.url ?? '');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await vault.updateItem(item.id, { url: url.trim() }));
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.errors?.length ? caught.errors[0]!.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Link">
      {editing ? (
        <form onSubmit={save} method="post" noValidate className="flex max-w-xl items-end gap-3">
          <Field className="flex-1" label="Web address" type="url" value={url} onChange={(event) => setUrl(event.target.value)} error={error} />
          <Button type="submit" loading={busy} className="mb-[0.05rem]">
            Save
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={item.url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-full border border-brass px-6 text-sm font-medium text-brass transition-colors duration-200 hover:bg-brass hover:text-ground"
          >
            Open link
          </a>
          <span className="min-w-0 break-all text-sm text-sage">{item.url}</span>
          <Button variant="quiet" onClick={() => setEditing(true)}>
            Change address
          </Button>
        </div>
      )}
    </section>
  );
}

/** One file, note or link, with its tags, fields and reminders. */
export function ItemView({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<VaultItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<'rename' | 'move' | null>(null);
  const [startWriting, setStartWriting] = useState(false);

  useEffect(() => {
    // Arriving from "New note" opens it ready for writing.
    if (new URLSearchParams(window.location.search).get('edit') === '1') {
      setStartWriting(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
    vault
      .item(id)
      .then(setItem)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not open it.'));
  }, [id]);

  if (!item) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Opening…</p>
    );
  }

  const folderHref = item.folderId ? `/vault/f/${item.folderId}` : '/vault';
  // Field, tag and reminder lists keep the full item fresh, but a note's text is only sent when asked for.
  const keepBody = (next: VaultItem) => setItem({ ...next, body: next.body ?? item.body });

  return (
    <>
      <Breadcrumbs path={item.path} current={false} />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-sage">{kindText(item.kind)}</p>
          <h1 className="font-display text-4xl leading-tight break-words text-ivory md:text-5xl">
            <Reveal key={item.name}>{item.name}</Reveal>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="quiet" aria-pressed={item.pinned} onClick={async () => keepBody(await vault.updateItem(item.id, { pinned: !item.pinned }))}>
            {item.pinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button variant="quiet" onClick={() => setAsking('rename')}>
            Rename
          </Button>
          <Button variant="quiet" onClick={() => setAsking('move')}>
            Move
          </Button>
          <Button
            variant="quiet"
            className="text-alert hover:text-alert"
            onClick={async () => {
              await vault.trashItem(item.id);
              router.push(folderHref);
            }}
          >
            Delete
          </Button>
        </div>
      </header>

      <FadeUp>
        {item.kind === 'note' ? <NoteEditor item={item} startWriting={startWriting} onSaved={keepBody} /> : null}
        {item.kind === 'link' ? <LinkPanel item={item} onSaved={keepBody} /> : null}
        {item.kind === 'file' ? <FileViewer item={item} /> : null}
      </FadeUp>

      <div className="mt-12 grid gap-10 border-t border-hairline pt-8 lg:grid-cols-3">
        <TagPicker item={item} onChanged={keepBody} />
        <FieldValues owner={{ itemId: item.id }} values={item.values} />
        <RemindersPanel owner={`item:${item.id}`} defaultTitle={item.name} />
      </div>

      {asking === 'rename' ? (
        <NameSheet
          title="Rename"
          action="Save"
          initialName={item.name}
          onClose={() => setAsking(null)}
          onSubmit={async ({ name }) => {
            keepBody(await vault.updateItem(item.id, { name }));
            setAsking(null);
          }}
        />
      ) : null}
      {asking === 'move' ? (
        <MoveSheet
          selection={{ folders: [], items: [item.id] }}
          fromId={item.folderId ?? 'root'}
          onClose={() => setAsking(null)}
          onMoved={async () => {
            setAsking(null);
            keepBody(await vault.item(item.id));
          }}
        />
      ) : null}
    </>
  );
}
