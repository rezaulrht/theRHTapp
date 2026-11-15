'use client';

import { Button, Field, Select } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { money, paisaToInput, toPaisa, type Account, type Category, type Shortcut } from '@/lib/money';
import { Confirm, MoveButtons, Problems, SavedNote, Section, moved, rowClass, useAction } from '../parts';

interface Choices {
  accounts: Account[];
  categories: Category[];
}

function ShortcutFields({
  values,
  set,
  errorAt,
  amountError,
  choices,
}: {
  values: { name: string; amount: string; accountId: string; categoryId: string };
  set(key: 'name' | 'amount' | 'accountId' | 'categoryId', value: string): void;
  errorAt(path: string): string | undefined;
  amountError?: string;
  choices: Choices;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1.4fr_0.8fr_1fr_1fr]">
      <Field
        label="Name"
        autoComplete="off"
        value={values.name}
        onChange={(event) => set('name', event.target.value)}
        error={errorAt('name')}
      />
      <Field
        label="Amount"
        inputMode="decimal"
        autoComplete="off"
        value={values.amount}
        onChange={(event) => set('amount', event.target.value)}
        error={amountError ?? errorAt('amount')}
      />
      <Select
        label="Paid from"
        value={values.accountId}
        onChange={(event) => set('accountId', event.target.value)}
        error={errorAt('accountId')}
      >
        {choices.accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
            {account.archived ? ' (archived)' : ''}
          </option>
        ))}
      </Select>
      <Select
        label="Category"
        value={values.categoryId}
        onChange={(event) => set('categoryId', event.target.value)}
        error={errorAt('categoryId')}
      >
        {choices.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
            {category.archived ? ' (archived)' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}

const shownPaths = ['name', 'amount', 'accountId', 'categoryId'];

function ShortcutRow({
  shortcut,
  choices,
  index,
  count,
  onMove,
  onChanged,
}: {
  shortcut: Shortcut;
  choices: Choices;
  index: number;
  count: number;
  onMove(by: -1 | 1): void;
  onChanged(): Promise<void>;
}) {
  const [values, setValues] = useState({
    name: shortcut.name,
    amount: paisaToInput(shortcut.amount),
    accountId: shortcut.accountId,
    categoryId: shortcut.categoryId,
  });
  const [amountError, setAmountError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const save = useAction();
  const remove = useAction();

  // An archived account or category stays in the list only for the shortcut that still points at it.
  const own: Choices = {
    accounts: choices.accounts.filter((account) => !account.archived || account.id === shortcut.accountId),
    categories: choices.categories.filter((category) => !category.archived || category.id === shortcut.categoryId),
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    const parsed = toPaisa(values.amount);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    setAmountError(undefined);
    const saved = await save.run(() =>
      money.updateShortcut(shortcut.id, {
        name: values.name.trim(),
        amount: parsed.paisa,
        accountId: values.accountId,
        categoryId: values.categoryId,
      }),
    );
    if (saved) await onChanged();
  }

  return (
    <li className={rowClass}>
      <form aria-label={shortcut.name} onSubmit={onSubmit} method="post" noValidate>
        <ShortcutFields
          values={values}
          set={(key, value) => {
            setValues((current) => ({ ...current, [key]: value }));
            save.touch();
          }}
          errorAt={save.errorAt}
          amountError={amountError}
          choices={own}
        />
        {shortcut.usable ? null : (
          <p className="mt-2 text-sm text-brass">
            Hidden from the day page because its account or category is archived. Pick another to use it again.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" loading={save.busy}>
            Save
          </Button>
          <SavedNote show={save.done} />
          <span className="ml-auto flex items-center">
            <MoveButtons name={shortcut.name} index={index} count={count} onMove={onMove} />
            <Button variant="quiet" aria-label={`Delete ${shortcut.name}`} onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </span>
        </div>
        <Problems list={[...save.problems(shownPaths), ...remove.problems([])]} />
        {confirming ? (
          <Confirm
            question={`Delete the shortcut ${shortcut.name}? Entries already made with it stay.`}
            yes="Yes, delete it"
            no="Keep it"
            busy={remove.busy}
            onNo={() => setConfirming(false)}
            onYes={async () => {
              if (await remove.run(() => money.deleteShortcut(shortcut.id))) await onChanged();
              else setConfirming(false);
            }}
          />
        ) : null}
      </form>
    </li>
  );
}

function AddShortcut({ choices, onChanged }: { choices: Choices; onChanged(): Promise<void> }) {
  const empty = {
    name: '',
    amount: '',
    accountId: choices.accounts[0]?.id ?? '',
    categoryId: choices.categories[0]?.id ?? '',
  };
  const [values, setValues] = useState(empty);
  const [amountError, setAmountError] = useState<string | undefined>();
  const add = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.busy) return;
    const parsed = toPaisa(values.amount);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    setAmountError(undefined);
    const made = await add.run(() =>
      money.createShortcut({
        name: values.name.trim(),
        amount: parsed.paisa,
        accountId: values.accountId,
        categoryId: values.categoryId,
      }),
    );
    if (made) {
      setValues({ ...empty, accountId: values.accountId, categoryId: values.categoryId });
      await onChanged();
    }
  }

  return (
    <form aria-label="Add a shortcut" onSubmit={onSubmit} method="post" noValidate className="mt-6">
      <h3 className="mb-3 text-sm text-sage">Add a shortcut</h3>
      <ShortcutFields
        values={values}
        set={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        errorAt={add.errorAt}
        amountError={amountError}
        choices={choices}
      />
      <div className="mt-3">
        <Button type="submit" variant="outline" loading={add.busy}>
          Add shortcut
        </Button>
      </div>
      <Problems list={add.problems(shownPaths)} />
    </form>
  );
}

/** Expenses that repeat, one tap each on the day page. */
export function ShortcutsEditor({
  shortcuts,
  accounts,
  categories,
  onChanged,
}: {
  shortcuts: Shortcut[];
  accounts: Account[];
  categories: Category[];
  onChanged(): Promise<void>;
}) {
  const reorder = useAction();
  const choices: Choices = { accounts, categories: categories.filter((category) => !category.isFees) };
  const active: Choices = {
    accounts: choices.accounts.filter((account) => !account.archived),
    categories: choices.categories.filter((category) => !category.archived),
  };

  async function move(index: number, by: -1 | 1) {
    if (await reorder.run(() => money.reorderShortcuts(moved(shortcuts, index, by)))) await onChanged();
  }

  return (
    <Section
      title="Shortcuts"
      intro="For what you pay again and again, such as the rickshaw to the office. One tap on the day page records it."
    >
      {shortcuts.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sage">No shortcuts yet.</p>
      ) : (
        <ul className="border-t border-hairline">
          {shortcuts.map((shortcut, index) => (
            <ShortcutRow
              key={shortcut.id}
              shortcut={shortcut}
              choices={choices}
              index={index}
              count={shortcuts.length}
              onMove={(by) => void move(index, by)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      <Problems list={reorder.problems([])} />
      {active.accounts.length > 0 && active.categories.length > 0 ? (
        <AddShortcut choices={active} onChanged={onChanged} />
      ) : null}
    </Section>
  );
}
