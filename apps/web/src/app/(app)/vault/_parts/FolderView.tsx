'use client';

import { Button, Select } from '@pa/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { ROOT, vault, type FolderContents, type ListQuery, type VaultField } from '@/lib/vault';
import { Breadcrumbs } from './Breadcrumbs';
import { EntryList, type Selection } from './EntryList';
import { SheetPresence } from '@/components/Sheet';
import { MoveSheet } from './MoveSheet';
import { NameSheet } from './NameSheet';
import { TodoList } from './TodoList';
import { DropZone, UploadList, useUploads } from './Uploader';

type Asking = 'folder' | 'note' | 'link' | 'rename' | 'move' | null;
const NONE: Selection = { folders: [], items: [] };

/** A filter on one field, as chosen on screen. */
interface Filter {
  fieldId: string;
  value: string;
}

function queryOf(sort: string, filter: Filter | null, fields: VaultField[]): ListQuery {
  const query: ListQuery = {};
  if (sort === 'name') query.sort = 'name';
  if (sort === 'updated') {
    query.sort = 'updated';
    query.descending = true;
  }
  if (sort.startsWith('field:')) query.sort = sort as `field:${string}`;
  const field = filter ? fields.find((entry) => entry.id === filter.fieldId) : undefined;
  if (filter && field && filter.value !== '') {
    if (field.type === 'boolean') query.filters = [{ fieldId: field.id, op: 'eq', value: filter.value === 'yes' }];
    else if (field.type === 'number') query.filters = [{ fieldId: field.id, op: 'eq', value: Number(filter.value) }];
    else if (field.type === 'text' || field.type === 'url') query.filters = [{ fieldId: field.id, op: 'contains', value: filter.value }];
    else query.filters = [{ fieldId: field.id, op: 'eq', value: filter.value }];
  }
  return query;
}

/**
 * One folder: what is in it, ways to add to it, and tools to sort, filter,
 * select, move and delete. `id` "root" is the top level of the Vault.
 */
export function FolderView({ id, before, after }: { id: string; before?: ReactNode; after?: (contents: FolderContents) => ReactNode }) {
  const router = useRouter();
  const top = id === ROOT;
  const parentForNew = top ? null : id;
  const [contents, setContents] = useState<FolderContents | null>(null);
  const [fields, setFields] = useState<VaultField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Selection>(NONE);
  const [sort, setSort] = useState('own');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: string[] } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  const query = queryOf(sort, filter, fields);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    const request = ++latest.current;
    try {
      const loaded = await vault.folder(id, JSON.parse(queryKey) as ListQuery);
      if (request !== latest.current) return;
      setContents(loaded);
      setError(null);
    } catch (caught) {
      if (request === latest.current) setError(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, [id, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    vault
      .fields()
      .then((loaded) => setFields(loaded.filter((field) => !field.archived)))
      .catch(() => setFields([]));
  }, []);

  const uploads = useUploads(parentForNew, () => void load());

  const count = selection.folders.length + selection.items.length;
  const stopSelecting = () => {
    setSelecting(false);
    setSelection(NONE);
  };

  async function trashSelected() {
    const roots = [...selection.folders, ...selection.items];
    try {
      await Promise.all([...selection.folders.map((folder) => vault.trashFolder(folder)), ...selection.items.map((item) => vault.trashItem(item))]);
      setNotice({ text: `${roots.length} moved to the trash.`, undo: roots });
    } catch (caught) {
      setNotice({ text: caught instanceof Error ? caught.message : 'Could not delete. Try again.' });
    }
    stopSelecting();
    void load();
  }

  async function undo(roots: string[]) {
    await Promise.all(roots.map((root) => vault.restore(root)));
    setNotice(null);
    void load();
  }

  if (!contents) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Opening…</p>
    );
  }

  const folder = contents.folder;
  const empty = contents.folders.length === 0 && contents.items.length === 0;
  const filterField = filter ? fields.find((field) => field.id === filter.fieldId) : undefined;

  return (
    <DropZone onFiles={(files) => void uploads.add(files)}>
      {folder ? <Breadcrumbs path={folder.path.slice(0, -1)} current={false} /> : null}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="min-w-0 font-display text-4xl leading-tight text-ivory md:text-5xl">
          <Reveal key={id}>{folder ? folder.name : 'Vault'}</Reveal>
        </h1>
        {folder ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="quiet"
              aria-pressed={folder.pinned}
              onClick={async () => {
                await vault.updateFolder(folder.id, { pinned: !folder.pinned });
                void load();
              }}
            >
              {folder.pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button variant="quiet" onClick={() => setAsking('rename')}>
              Rename
            </Button>
            <Button
              variant="quiet"
              className="text-alert hover:text-alert"
              onClick={async () => {
                await vault.trashFolder(folder.id);
                router.push(folder.parentId ? `/vault/f/${folder.parentId}` : '/vault');
              }}
            >
              Delete folder
            </Button>
          </div>
        ) : null}
      </header>

      {before}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setAsking('folder')}>
          New folder
        </Button>
        <Button variant="outline" onClick={() => setAsking('note')}>
          New note
        </Button>
        <Button variant="outline" onClick={() => setAsking('link')}>
          New link
        </Button>
        <Button variant="outline" onClick={() => picker.current?.click()}>
          Upload files
        </Button>
        <input
          ref={picker}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose files to upload"
          tabIndex={-1}
          onChange={(event) => {
            void uploads.add(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      <p className="-mt-2 mb-5 hidden text-xs text-sage md:block">Or drop files anywhere here. Up to {uploads.maxMb} MB each.</p>

      <UploadList jobs={uploads.jobs} onClear={uploads.clear} />

      {notice ? (
        <p role="status" className="mb-4 flex items-center gap-3 text-sm text-brass">
          {notice.text}
          {notice.undo ? (
            <button type="button" className="underline underline-offset-2 hover:text-ivory" onClick={() => void undo(notice.undo!)}>
              Undo
            </button>
          ) : null}
        </p>
      ) : null}

      {!empty || filter ? (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Select label="Sort" value={sort} onChange={(event) => setSort(event.target.value)} className="w-44">
            <option value="own">Your order</option>
            <option value="name">Name</option>
            <option value="updated">Last changed</option>
            {fields.map((field) => (
              <option key={field.id} value={`field:${field.id}`}>
                {field.name}
              </option>
            ))}
          </Select>
          {fields.length > 0 ? (
            <Select
              label="Filter by"
              value={filter?.fieldId ?? ''}
              onChange={(event) => setFilter(event.target.value ? { fieldId: event.target.value, value: '' } : null)}
              className="w-44"
            >
              <option value="">Nothing</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </Select>
          ) : null}
          {filter && filterField ? (
            filterField.type === 'choice' || filterField.type === 'boolean' ? (
              <Select label="Is" value={filter.value} onChange={(event) => setFilter({ ...filter, value: event.target.value })} className="w-44">
                <option value="">Anything</option>
                {(filterField.type === 'boolean' ? ['yes', 'no'] : filterField.choices).map((choice) => (
                  <option key={choice} value={choice}>
                    {filterField.type === 'boolean' ? (choice === 'yes' ? 'Yes' : 'No') : choice}
                  </option>
                ))}
              </Select>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm text-sage">
                {filterField.type === 'text' || filterField.type === 'url' ? 'Contains' : 'Is'}
                <input
                  type={filterField.type === 'date' ? 'date' : filterField.type === 'number' ? 'number' : 'text'}
                  value={filter.value}
                  onChange={(event) => setFilter({ ...filter, value: event.target.value })}
                  className="min-h-11 w-44 rounded-[var(--radius-control)] border border-hairline bg-ground px-3.5 text-base text-ivory [color-scheme:dark]"
                />
              </label>
            )
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {selecting ? (
              <>
                <span className="text-sm text-sage">{count} selected</span>
                <Button variant="outline" disabled={count === 0} onClick={() => setAsking('move')}>
                  Move
                </Button>
                <Button variant="outline" disabled={count === 0} className="border-alert text-alert" onClick={() => void trashSelected()}>
                  Delete selected
                </Button>
                <Button variant="quiet" onClick={stopSelecting}>
                  Done
                </Button>
              </>
            ) : (
              <Button variant="quiet" onClick={() => setSelecting(true)}>
                Select
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {empty ? (
        <p className="border-y border-hairline py-10 text-center text-sage">
          {filter ? 'Nothing here matches.' : top ? 'Nothing here yet. Make a folder for a subject, or for work.' : 'This folder is empty.'}
        </p>
      ) : (
        <EntryList
          label="In this folder"
          folders={contents.folders}
          items={contents.items}
          selection={selecting ? selection : undefined}
          onSelect={setSelection}
        />
      )}

      {folder ? <TodoList folderId={folder.id} todos={contents.todos} onChanged={() => void load()} /> : null}
      {after?.(contents)}

      <SheetPresence>
        {asking === 'folder' ? (
          <NameSheet
            key="folder"
            title="New folder"
            action="Make folder"
            onClose={() => setAsking(null)}
            onSubmit={async ({ name }) => {
              await vault.createFolder(parentForNew, name);
              setAsking(null);
              void load();
            }}
          />
        ) : null}
        {asking === 'note' ? (
          <NameSheet
            key="note"
            title="New note"
            action="Make note"
            onClose={() => setAsking(null)}
            onSubmit={async ({ name }) => {
              const made = await vault.createNote(parentForNew, name);
              router.push(`/vault/i/${made.id}?edit=1`);
            }}
          />
        ) : null}
        {asking === 'link' ? (
          <NameSheet
            key="link"
            title="New link"
            action="Save link"
            withUrl
            onClose={() => setAsking(null)}
            onSubmit={async ({ name, url }) => {
              await vault.createLink(parentForNew, name, url);
              setAsking(null);
              void load();
            }}
          />
        ) : null}
        {asking === 'rename' && folder ? (
          <NameSheet
            key="rename"
            title="Rename folder"
            action="Save"
            initialName={folder.name}
            onClose={() => setAsking(null)}
            onSubmit={async ({ name }) => {
              await vault.updateFolder(folder.id, { name });
              setAsking(null);
              void load();
            }}
          />
        ) : null}
        {asking === 'move' ? (
          <MoveSheet
            key="move"
            selection={selection}
            fromId={id}
            onClose={() => setAsking(null)}
            onMoved={() => {
              setAsking(null);
              setNotice({ text: `${count} moved.` });
              stopSelecting();
              void load();
            }}
          />
        ) : null}
      </SheetPresence>
    </DropZone>
  );
}
