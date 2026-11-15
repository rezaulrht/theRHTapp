'use client';

import { Button, Field } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { money, paisaToInput, toBalancePaisa, type Account } from '@/lib/money';
import { Confirm, MoveButtons, Problems, SavedNote, Section, moved, rowClass, useAction } from './shared';

const balanceText = (paisa: number) => (paisa < 0 ? `-${paisaToInput(-paisa)}` : paisaToInput(paisa));

function AccountRow({
  account,
  index,
  count,
  onMove,
  onChanged,
}: {
  account: Account;
  index: number;
  count: number;
  onMove(by: -1 | 1): void;
  onChanged(): Promise<void>;
}) {
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(balanceText(account.openingBalance));
  const [date, setDate] = useState(account.openingDate);
  const [balanceError, setBalanceError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const save = useAction();
  const archive = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    const parsed = toBalancePaisa(balance);
    if (!parsed.ok) {
      setBalanceError(parsed.message);
      return;
    }
    setBalanceError(undefined);
    if (await save.run(() => money.updateAccount(account.id, { name: name.trim(), openingBalance: parsed.paisa, openingDate: date }))) {
      await onChanged();
    }
  }

  return (
    <li className={rowClass}>
      <form aria-label={account.name} onSubmit={onSubmit} method="post" noValidate>
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
          />
          <Field
            label="Opening balance"
            inputMode="decimal"
            autoComplete="off"
            value={balance}
            onChange={(event) => {
              setBalance(event.target.value);
              save.touch();
            }}
            error={balanceError ?? save.errorAt('openingBalance')}
          />
          <Field
            label="Opening date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value || account.openingDate);
              save.touch();
            }}
            error={save.errorAt('openingDate')}
            className="[color-scheme:dark]"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" loading={save.busy}>
            Save
          </Button>
          <SavedNote show={save.done} />
          <span className="ml-auto flex items-center">
            <MoveButtons name={account.name} index={index} count={count} onMove={onMove} />
            <Button variant="quiet" aria-label={`Archive ${account.name}`} onClick={() => setConfirming(true)}>
              Archive
            </Button>
          </span>
        </div>
        <Problems list={[...save.problems(['name', 'openingBalance', 'openingDate']), ...archive.problems([])]} />
        {confirming ? (
          <Confirm
            question={`Archive ${account.name}? It leaves the pickers and the balance strip. Its entries stay, and you can restore it.`}
            yes="Yes, archive it"
            no="Keep it"
            busy={archive.busy}
            onNo={() => setConfirming(false)}
            onYes={async () => {
              if (await archive.run(() => money.updateAccount(account.id, { archived: true }))) await onChanged();
              setConfirming(false);
            }}
          />
        ) : null}
      </form>
    </li>
  );
}

function ArchivedRow({ account, onChanged }: { account: Account; onChanged(): Promise<void> }) {
  const restore = useAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-2">
      <span className="text-sage">{account.name}</span>
      <Button
        variant="quiet"
        aria-label={`Restore ${account.name}`}
        loading={restore.busy}
        className="-mr-6"
        onClick={async () => {
          if (await restore.run(() => money.updateAccount(account.id, { archived: false }))) await onChanged();
        }}
      >
        Restore
      </Button>
      <Problems list={restore.problems([])} />
    </li>
  );
}

function AddAccount({ today, onChanged }: { today: string; onChanged(): Promise<void> }) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(today);
  const [balanceError, setBalanceError] = useState<string | undefined>();
  const add = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.busy) return;
    const parsed = toBalancePaisa(balance.trim() === '' ? '0' : balance);
    if (!parsed.ok) {
      setBalanceError(parsed.message);
      return;
    }
    setBalanceError(undefined);
    const made = await add.run(() =>
      money.createAccount({ name: name.trim(), openingBalance: parsed.paisa, openingDate: date }),
    );
    if (made) {
      setName('');
      setBalance('');
      await onChanged();
    }
  }

  return (
    <form aria-label="Add an account" onSubmit={onSubmit} method="post" noValidate className="mt-6">
      <h3 className="mb-3 text-sm text-sage">Add an account</h3>
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
        <Field
          label="Name"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={add.errorAt('name')}
        />
        <Field
          label="Opening balance"
          inputMode="decimal"
          autoComplete="off"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          error={balanceError ?? add.errorAt('openingBalance')}
          hint="What was in it on the opening date."
        />
        <Field
          label="Opening date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value || today)}
          error={add.errorAt('openingDate')}
          className="[color-scheme:dark]"
        />
      </div>
      <div className="mt-3">
        <Button type="submit" variant="outline" loading={add.busy}>
          Add account
        </Button>
      </div>
      <Problems list={add.problems(['name', 'openingBalance', 'openingDate'])} />
    </form>
  );
}

/** Where the money is kept: add, rename, reorder, archive and restore. */
export function AccountsEditor({
  accounts,
  today,
  onChanged,
}: {
  accounts: Account[];
  today: string;
  onChanged(): Promise<void>;
}) {
  const active = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);
  const reorder = useAction();

  async function move(index: number, by: -1 | 1) {
    const ids = [...moved(active, index, by), ...archived.map((account) => account.id)];
    if (await reorder.run(() => money.reorderAccounts(ids))) await onChanged();
  }

  return (
    <Section
      title="Accounts"
      intro="Each place you keep money. The opening balance is what it held on the opening date; everything after is worked out from your entries."
    >
      <ul className="border-t border-hairline">
        {active.map((account, index) => (
          <AccountRow
            key={account.id}
            account={account}
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
          <ul aria-label="Archived accounts" className="border-t border-hairline">
            {archived.map((account) => (
              <ArchivedRow key={account.id} account={account} onChanged={onChanged} />
            ))}
          </ul>
        </>
      ) : null}

      <AddAccount today={today} onChanged={onChanged} />
    </Section>
  );
}
