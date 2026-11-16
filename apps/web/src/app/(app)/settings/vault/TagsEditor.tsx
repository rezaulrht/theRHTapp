'use client';

import { CATEGORY_COLORS } from '@pa/shared/categories';
import { Button, Field, Select } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { vault, type VaultTag } from '@/lib/vault';
import { Confirm, Problems, SavedNote, Section, rowClass, useAction } from '../parts';

const COLORS = Object.keys(CATEGORY_COLORS) as (keyof typeof CATEGORY_COLORS)[];
const titled = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function TagRow({ tag, onChanged }: { tag: VaultTag; onChanged(): Promise<void> }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [confirming, setConfirming] = useState(false);
  const save = useAction();
  const remove = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    if (await save.run(() => vault.updateTag(tag.id, { name: name.trim(), color }))) await onChanged();
  }

  return (
    <li className={rowClass}>
      <form aria-label={tag.name} onSubmit={onSubmit} method="post" noValidate>
        <div className="grid items-end gap-4 sm:grid-cols-[1.2fr_1fr]">
          <Field
            label="Name"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              save.touch();
            }}
            error={save.errorAt('name')}
            hint={`On ${tag.count} ${tag.count === 1 ? 'item' : 'items'}`}
          />
          <div className="flex items-end gap-2">
            <span aria-hidden="true" className="mb-3.5 size-4 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[color as keyof typeof CATEGORY_COLORS] }} />
            <Select
              label="Colour"
              value={color}
              onChange={(event) => {
                setColor(event.target.value);
                save.touch();
              }}
              className="flex-1"
            >
              {COLORS.map((value) => (
                <option key={value} value={value}>
                  {titled(value)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" loading={save.busy}>
            Save
          </Button>
          <SavedNote show={save.done} />
          <Button variant="quiet" className="ml-auto -mr-6" aria-label={`Delete ${tag.name}`} onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
        <Problems list={[...save.problems(['name']), ...remove.problems([])]} />
        {confirming ? (
          <Confirm
            question={`Delete the tag ${tag.name}? It comes off ${tag.count} ${tag.count === 1 ? 'item' : 'items'}; the items stay.`}
            yes="Yes, delete it"
            no="Keep it"
            busy={remove.busy}
            onNo={() => setConfirming(false)}
            onYes={async () => {
              if (await remove.run(() => vault.deleteTag(tag.id))) await onChanged();
              else setConfirming(false);
            }}
          />
        ) : null}
      </form>
    </li>
  );
}

/** Tags that cut across folders, such as "Exam revision". */
export function TagsEditor({ tags, onChanged }: { tags: VaultTag[]; onChanged(): Promise<void> }) {
  const [name, setName] = useState('');
  const add = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.busy) return;
    if (await add.run(() => vault.createTag(name.trim()))) {
      setName('');
      await onChanged();
    }
  }

  return (
    <Section title="Tags" intro="One item can carry several tags, so it shows up under each of them wherever it is filed.">
      {tags.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sage">No tags yet. Add them here or on any item.</p>
      ) : (
        <ul className="border-t border-hairline">
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <form aria-label="Add a tag" onSubmit={onSubmit} method="post" noValidate className="mt-6 flex max-w-md items-end gap-3">
        <Field className="flex-1" label="New tag" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} error={add.errorAt('name')} />
        <Button type="submit" variant="outline" loading={add.busy}>
          Add tag
        </Button>
      </form>
      <Problems list={add.problems(['name'])} />
    </Section>
  );
}
