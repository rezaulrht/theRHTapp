'use client';

import { Button, Field, Select } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { vault, type FieldType, type VaultField } from '@/lib/vault';
import { MoveButtons, Problems, SavedNote, Section, moved, rowClass, useAction } from '../parts';

export const TYPE_NAMES: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  choice: 'Choice from a list',
  url: 'Web address',
  boolean: 'Yes or no',
};

/** Choices are written one per line. */
const choicesOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function FieldRow({
  field,
  index,
  count,
  onMove,
  onChanged,
}: {
  field: VaultField;
  index: number;
  count: number;
  onMove(by: -1 | 1): void;
  onChanged(): Promise<void>;
}) {
  const [name, setName] = useState(field.name);
  const [choices, setChoices] = useState(field.choices.join('\n'));
  const save = useAction();
  const archive = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    const body = field.type === 'choice' ? { name: name.trim(), choices: choicesOf(choices) } : { name: name.trim() };
    if (await save.run(() => vault.updateField(field.id, body))) await onChanged();
  }

  return (
    <li className={rowClass}>
      <form aria-label={field.name} onSubmit={onSubmit} method="post" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <Field
            label="Name"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              save.touch();
            }}
            error={save.errorAt('name')}
          />
          <p className="flex flex-col gap-1.5 text-sm text-sage">
            Type
            <span className="flex min-h-11 items-center text-base text-ivory">{TYPE_NAMES[field.type]}</span>
          </p>
        </div>
        {field.type === 'choice' ? (
          <label className="mt-4 flex max-w-md flex-col gap-1.5">
            <span className="text-sm text-sage">Choices, one per line</span>
            <textarea
              value={choices}
              rows={Math.min(Math.max(field.choices.length + 1, 3), 8)}
              onChange={(event) => {
                setChoices(event.target.value);
                save.touch();
              }}
              aria-invalid={save.errorAt('choices') ? true : undefined}
              className="rounded-[var(--radius-control)] border border-hairline bg-ground p-3 text-base text-ivory aria-[invalid=true]:border-alert"
            />
            {save.errorAt('choices') ? <span className="text-sm text-alert">{save.errorAt('choices')}</span> : null}
          </label>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" loading={save.busy}>
            Save
          </Button>
          <SavedNote show={save.done} />
          <span className="ml-auto flex items-center">
            <MoveButtons name={field.name} index={index} count={count} onMove={onMove} />
            <Button
              variant="quiet"
              aria-label={`Archive ${field.name}`}
              loading={archive.busy}
              onClick={async () => {
                if (await archive.run(() => vault.updateField(field.id, { archived: true }))) await onChanged();
              }}
            >
              Archive
            </Button>
          </span>
        </div>
        <Problems list={[...save.problems(['name', 'choices']), ...archive.problems([])]} />
      </form>
    </li>
  );
}

function AddField({ onChanged }: { onChanged(): Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [choices, setChoices] = useState('');
  const add = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.busy) return;
    const body = type === 'choice' ? { name: name.trim(), type, choices: choicesOf(choices) } : { name: name.trim(), type };
    if (await add.run(() => vault.createField(body))) {
      setName('');
      setChoices('');
      await onChanged();
    }
  }

  return (
    <form aria-label="Add a field" onSubmit={onSubmit} method="post" noValidate className="mt-6">
      <h3 className="mb-3 text-sm text-sage">Add a field</h3>
      <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
        <Field label="Name" autoComplete="off" placeholder="Teacher, Exam date, Source…" value={name} onChange={(event) => setName(event.target.value)} error={add.errorAt('name')} />
        <Select label="Type" value={type} onChange={(event) => setType(event.target.value as FieldType)} error={add.errorAt('type')}>
          {(Object.keys(TYPE_NAMES) as FieldType[]).map((value) => (
            <option key={value} value={value}>
              {TYPE_NAMES[value]}
            </option>
          ))}
        </Select>
      </div>
      {type === 'choice' ? (
        <label className="mt-4 flex max-w-md flex-col gap-1.5">
          <span className="text-sm text-sage">Choices, one per line</span>
          <textarea
            value={choices}
            rows={4}
            onChange={(event) => setChoices(event.target.value)}
            aria-invalid={add.errorAt('choices') ? true : undefined}
            className="rounded-[var(--radius-control)] border border-hairline bg-ground p-3 text-base text-ivory aria-[invalid=true]:border-alert"
          />
          {add.errorAt('choices') ? <span className="text-sm text-alert">{add.errorAt('choices')}</span> : null}
        </label>
      ) : null}
      <p className="mt-2 text-xs text-sage">The type cannot be changed later.</p>
      <div className="mt-3">
        <Button type="submit" variant="outline" loading={add.busy}>
          Add field
        </Button>
      </div>
      <Problems list={add.problems(['name', 'type', 'choices'])} />
    </form>
  );
}

/** The owner's own fields, given to any folder or item: name, type and choices. */
export function FieldsEditor({ fields, onChanged }: { fields: VaultField[]; onChanged(): Promise<void> }) {
  const active = fields.filter((field) => !field.archived);
  const archived = fields.filter((field) => field.archived);
  const reorder = useAction();
  const restore = useAction();

  async function move(index: number, by: -1 | 1) {
    const ids = [...moved(active, index, by), ...archived.map((field) => field.id)];
    if (await reorder.run(() => vault.reorderFields(ids))) await onChanged();
  }

  return (
    <Section title="Fields" intro="Your own details for any folder or item, such as Teacher, Exam date or Source. Lists can be sorted and filtered by them.">
      {active.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sage">No fields yet.</p>
      ) : (
        <ul className="border-t border-hairline">
          {active.map((field, index) => (
            <FieldRow key={field.id} field={field} index={index} count={active.length} onMove={(by) => void move(index, by)} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <Problems list={[...reorder.problems([]), ...restore.problems([])]} />
      {archived.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 text-sm text-sage">Archived</h3>
          <ul aria-label="Archived fields" className="border-t border-hairline">
            {archived.map((field) => (
              <li key={field.id} className="flex items-center justify-between gap-3 border-b border-hairline py-2">
                <span className="text-sage">
                  {field.name} <span className="text-xs">({TYPE_NAMES[field.type]})</span>
                </span>
                <Button
                  variant="quiet"
                  className="-mr-6"
                  aria-label={`Restore ${field.name}`}
                  onClick={async () => {
                    if (await restore.run(() => vault.updateField(field.id, { archived: false }))) await onChanged();
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <AddField onChanged={onChanged} />
    </Section>
  );
}
