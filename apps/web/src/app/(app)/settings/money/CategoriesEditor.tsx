'use client';

import { CATEGORY_COLORS, CATEGORY_ICONS } from '@pa/shared/categories';
import { Button, Field, Select } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { money, type Category } from '@/lib/money';
import { Confirm, MoveButtons, Problems, SavedNote, Section, moved, rowClass, useAction } from '../parts';

const colorNames = Object.keys(CATEGORY_COLORS) as (keyof typeof CATEGORY_COLORS)[];
const titled = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function LookFields({
  color,
  icon,
  onColor,
  onIcon,
}: {
  color: string;
  icon: string;
  onColor(value: string): void;
  onIcon(value: string): void;
}) {
  return (
    <>
      <div className="flex items-end gap-2">
        <span
          aria-hidden="true"
          className="mb-3.5 size-4 shrink-0 rounded-full"
          style={{ background: CATEGORY_COLORS[color as keyof typeof CATEGORY_COLORS] ?? 'var(--color-sage)' }}
        />
        <Select label="Colour" value={color} onChange={(event) => onColor(event.target.value)} className="flex-1">
          {colorNames.map((name) => (
            <option key={name} value={name}>
              {titled(name)}
            </option>
          ))}
        </Select>
      </div>
      <Select label="Icon" value={icon} onChange={(event) => onIcon(event.target.value)}>
        {CATEGORY_ICONS.map((name) => (
          <option key={name} value={name}>
            {titled(name)}
          </option>
        ))}
      </Select>
    </>
  );
}

function CategoryRow({
  category,
  others,
  index,
  count,
  onMove,
  onChanged,
}: {
  category: Category;
  /** Categories this one could be merged into. */
  others: Category[];
  index: number;
  count: number;
  onMove(by: -1 | 1): void;
  onChanged(): Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [icon, setIcon] = useState(category.icon);
  const [intoId, setIntoId] = useState('');
  const [asking, setAsking] = useState<'archive' | 'merge' | null>(null);
  const save = useAction();
  const change = useAction();
  const into = others.find((other) => other.id === intoId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    if (await save.run(() => money.updateCategory(category.id, { name: name.trim(), color, icon }))) await onChanged();
  }

  return (
    <li className={rowClass}>
      <form aria-label={category.name} onSubmit={onSubmit} method="post" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
          <Field
            label="Name"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              save.touch();
            }}
            error={save.errorAt('name')}
            hint={category.isFees ? 'Transfer fees are filed here.' : undefined}
          />
          <LookFields
            color={color}
            icon={icon}
            onColor={(value) => {
              setColor(value);
              save.touch();
            }}
            onIcon={(value) => {
              setIcon(value);
              save.touch();
            }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" loading={save.busy}>
            Save
          </Button>
          <SavedNote show={save.done} />
          <span className="ml-auto flex items-center">
            <MoveButtons name={category.name} index={index} count={count} onMove={onMove} />
            {category.isFees ? null : (
              <Button variant="quiet" aria-label={`Archive ${category.name}`} onClick={() => setAsking('archive')}>
                Archive
              </Button>
            )}
          </span>
        </div>

        {category.isFees || others.length === 0 ? null : (
          <div className="mt-3 flex max-w-sm items-end gap-3">
            <Select
              label="Merge into"
              value={intoId}
              onChange={(event) => setIntoId(event.target.value)}
              className="flex-1"
            >
              <option value="">Choose a category</option>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </Select>
            <Button variant="quiet" disabled={!into} onClick={() => setAsking('merge')}>
              Merge
            </Button>
          </div>
        )}

        <Problems list={[...save.problems(['name']), ...change.problems([])]} />

        {asking === 'archive' ? (
          <Confirm
            question={`Archive ${category.name}? It leaves the pickers. Old entries keep it, and you can restore it.`}
            yes="Yes, archive it"
            no="Keep it"
            busy={change.busy}
            onNo={() => setAsking(null)}
            onYes={async () => {
              if (await change.run(() => money.updateCategory(category.id, { archived: true }))) await onChanged();
              setAsking(null);
            }}
          />
        ) : null}
        {asking === 'merge' && into ? (
          <Confirm
            question={`Move everything in ${category.name} into ${into.name} and remove ${category.name}? This cannot be undone.`}
            yes="Yes, merge them"
            no="Keep both"
            busy={change.busy}
            onNo={() => setAsking(null)}
            onYes={async () => {
              if (await change.run(() => money.mergeCategory(category.id, into.id))) await onChanged();
              setAsking(null);
            }}
          />
        ) : null}
      </form>
    </li>
  );
}

function ArchivedRow({ category, onChanged }: { category: Category; onChanged(): Promise<void> }) {
  const restore = useAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-2">
      <span className="text-sage">{category.name}</span>
      <Button
        variant="quiet"
        aria-label={`Restore ${category.name}`}
        loading={restore.busy}
        className="-mr-6"
        onClick={async () => {
          if (await restore.run(() => money.updateCategory(category.id, { archived: false }))) await onChanged();
        }}
      >
        Restore
      </Button>
      <Problems list={restore.problems([])} />
    </li>
  );
}

function AddCategory({ onChanged }: { onChanged(): Promise<void> }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(colorNames[0]!);
  const [icon, setIcon] = useState<string>('dot');
  const add = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.busy) return;
    if (await add.run(() => money.createCategory({ name: name.trim(), color, icon }))) {
      setName('');
      await onChanged();
    }
  }

  return (
    <form aria-label="Add a category" onSubmit={onSubmit} method="post" noValidate className="mt-6">
      <h3 className="mb-3 text-sm text-sage">Add a category</h3>
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
        <Field
          label="Name"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={add.errorAt('name')}
        />
        <LookFields color={color} icon={icon} onColor={setColor} onIcon={setIcon} />
      </div>
      <div className="mt-3">
        <Button type="submit" variant="outline" loading={add.busy}>
          Add category
        </Button>
      </div>
      <Problems list={add.problems(['name'])} />
    </form>
  );
}

/** What spending is filed under: add, rename, recolour, reorder, merge, archive and restore. */
export function CategoriesEditor({ categories, onChanged }: { categories: Category[]; onChanged(): Promise<void> }) {
  const active = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);
  const reorder = useAction();

  async function move(index: number, by: -1 | 1) {
    const ids = [...moved(active, index, by), ...archived.map((category) => category.id)];
    if (await reorder.run(() => money.reorderCategories(ids))) await onChanged();
  }

  return (
    <Section title="Categories" intro="Merging moves every entry, shortcut and budget from one category into another.">
      <ul className="border-t border-hairline">
        {active.map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            others={active.filter((other) => other.id !== category.id && !other.isFees)}
            index={index}
            count={active.length}
            onMove={(by) => void move(index, by)}
            onChanged={onChanged}
          />
        ))}
      </ul>
      <Problems list={reorder.problems([])} />

      {archived.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 text-sm text-sage">Archived</h3>
          <ul aria-label="Archived categories" className="border-t border-hairline">
            {archived.map((category) => (
              <ArchivedRow key={category.id} category={category} onChanged={onChanged} />
            ))}
          </ul>
        </>
      ) : null}

      <AddCategory onChanged={onChanged} />
    </Section>
  );
}
