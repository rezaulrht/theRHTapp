'use client';

import { Button, Field } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { money, type Person } from '@/lib/money';
import { owedText } from '@/lib/money-text';
import { Confirm, Problems, SavedNote, Section, rowClass, useAction } from '../parts';

function PersonRow({ person, symbol, onChanged }: { person: Person; symbol: string; onChanged(): Promise<void> }) {
  const [name, setName] = useState(person.name);
  const [confirming, setConfirming] = useState(false);
  const save = useAction();
  const archive = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    if (await save.run(() => money.updatePerson(person.id, { name: name.trim() }))) await onChanged();
  }

  return (
    <li className={rowClass}>
      <form aria-label={person.name} onSubmit={onSubmit} method="post" noValidate>
        <div className="flex max-w-md items-end gap-3">
          <Field
            className="flex-1"
            label="Name"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              save.touch();
            }}
            error={save.errorAt('name')}
            hint={owedText(person.name, person.owed, symbol)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" loading={save.busy}>
            Save
          </Button>
          <SavedNote show={save.done} />
          <Button
            variant="quiet"
            className="ml-auto"
            aria-label={`Archive ${person.name}`}
            onClick={() => setConfirming(true)}
          >
            Archive
          </Button>
        </div>
        <Problems list={[...save.problems(['name']), ...archive.problems([])]} />
        {confirming ? (
          <Confirm
            question={`Archive ${person.name}? They leave the Loans page. Their history stays, and you can restore them.`}
            yes="Yes, archive them"
            no="Keep them"
            busy={archive.busy}
            onNo={() => setConfirming(false)}
            onYes={async () => {
              if (await archive.run(() => money.updatePerson(person.id, { archived: true }))) await onChanged();
              setConfirming(false);
            }}
          />
        ) : null}
      </form>
    </li>
  );
}

function ArchivedRow({ person, onChanged }: { person: Person; onChanged(): Promise<void> }) {
  const restore = useAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-2">
      <span className="text-sage">{person.name}</span>
      <Button
        variant="quiet"
        aria-label={`Restore ${person.name}`}
        loading={restore.busy}
        className="-mr-6"
        onClick={async () => {
          if (await restore.run(() => money.updatePerson(person.id, { archived: false }))) await onChanged();
        }}
      >
        Restore
      </Button>
      <Problems list={restore.problems([])} />
    </li>
  );
}

/** People you lend to or borrow from. */
export function PeopleEditor({
  people,
  symbol,
  onChanged,
}: {
  people: Person[];
  symbol: string;
  onChanged(): Promise<void>;
}) {
  const active = people.filter((person) => !person.archived);
  const archived = people.filter((person) => person.archived);
  const [name, setName] = useState('');
  const add = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.busy) return;
    if (await add.run(() => money.createPerson(name.trim()))) {
      setName('');
      await onChanged();
    }
  }

  return (
    <Section title="People" intro="Someone can be archived only once nothing is owed either way.">
      {active.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sage">Nobody yet.</p>
      ) : (
        <ul className="border-t border-hairline">
          {active.map((person) => (
            <PersonRow key={person.id} person={person} symbol={symbol} onChanged={onChanged} />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 text-sm text-sage">Archived</h3>
          <ul aria-label="Archived people" className="border-t border-hairline">
            {archived.map((person) => (
              <ArchivedRow key={person.id} person={person} onChanged={onChanged} />
            ))}
          </ul>
        </>
      ) : null}

      <form aria-label="Add a person" onSubmit={onSubmit} method="post" noValidate className="mt-6 flex max-w-md items-end gap-3">
        <Field
          className="flex-1"
          label="New person"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={add.errorAt('name')}
        />
        <Button type="submit" variant="outline" loading={add.busy}>
          Add person
        </Button>
      </form>
      <Problems list={add.problems(['name'])} />
    </Section>
  );
}
