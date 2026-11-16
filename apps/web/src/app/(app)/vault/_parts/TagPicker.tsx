'use client';

import { CATEGORY_COLORS } from '@pa/shared/categories';
import { Button } from '@pa/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { vault, type VaultItem, type VaultTag } from '@/lib/vault';

const dot = (color: string) => CATEGORY_COLORS[color as keyof typeof CATEGORY_COLORS] ?? 'var(--color-brass)';

/** An item's tags: each opens the tag's page; add from the list or make a new one. */
export function TagPicker({ item, onChanged }: { item: VaultItem; onChanged(next: VaultItem): void }) {
  const [tags, setTags] = useState<VaultTag[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    vault
      .tags()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  async function save(tagIds: string[]) {
    setError(null);
    try {
      onChanged(await vault.setItemTags(item.id, tagIds));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wanted = name.trim();
    if (!wanted || busy) return;
    setBusy(true);
    try {
      let tag = tags.find((entry) => entry.name.toLowerCase() === wanted.toLowerCase());
      if (!tag) {
        tag = await vault.createTag(wanted);
        setTags((current) => [...current, tag!].sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (!item.tagIds.includes(tag.id)) await save([...item.tagIds, tag.id]);
      setName('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the tag.');
    } finally {
      setBusy(false);
    }
  }

  const mine = tags.filter((tag) => item.tagIds.includes(tag.id));
  const others = tags.filter((tag) => !item.tagIds.includes(tag.id));

  return (
    <section aria-labelledby="tags-heading">
      <h2 id="tags-heading" className="mb-3 text-sm text-sage">
        Tags
      </h2>
      <ul aria-label="Tags on this" className="mb-3 flex flex-wrap gap-2">
        {mine.map((tag) => (
          <li key={tag.id} className="flex items-center overflow-hidden rounded-full border border-hairline">
            <Link href={`/vault/tags/${tag.id}`} className="flex min-h-9 items-center gap-2 pl-3 pr-2 text-sm text-ivory hover:text-brass">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: dot(tag.color) }} />
              {tag.name}
            </Link>
            <button
              type="button"
              aria-label={`Remove the tag ${tag.name}`}
              onClick={() => void save(item.tagIds.filter((id) => id !== tag.id))}
              className="grid min-h-9 w-8 place-items-center border-l border-hairline text-sage hover:text-alert"
            >
              ×
            </button>
          </li>
        ))}
        {mine.length === 0 ? <li className="text-sm text-sage/80">No tags yet.</li> : null}
      </ul>
      <form onSubmit={add} className="flex max-w-sm items-center gap-2">
        <label htmlFor={`tag-${item.id}`} className="sr-only">
          Add a tag
        </label>
        <input
          id={`tag-${item.id}`}
          list={`tag-options-${item.id}`}
          placeholder="Add a tag"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-10 flex-1 rounded-full border border-hairline bg-transparent px-4 text-sm text-ivory placeholder:text-sage/70"
        />
        <datalist id={`tag-options-${item.id}`}>
          {others.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" loading={busy} disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
