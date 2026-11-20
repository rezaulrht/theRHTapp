'use client';

import { Button, Field, Select } from '@pa/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { FadeUp } from '@/components/motion/Stagger';
import { useSettings } from '@/components/SettingsProvider';
import { Sheet, SheetPresence } from '@/components/Sheet';
import { ApiError } from '@/lib/api';
import { money, toPaisa, type Account, type Entry, type LoanDirection, type Person } from '@/lib/money';
import { formatMoney, owedText, todayInZone } from '@/lib/money-text';
import { EntryRow } from '../EntryRow';
import { EntrySheet } from '../EntrySheet';

const directions: { value: LoanDirection; label: string }[] = [
  { value: 'lent', label: 'I lent them money' },
  { value: 'repaid_to_me', label: 'They paid me back' },
  { value: 'borrowed', label: 'I borrowed from them' },
  { value: 'repaid_by_me', label: 'I paid them back' },
];

/** What most likely happens next with this person. */
function likelyDirection(person: Person): LoanDirection {
  if (person.owed > 0) return 'repaid_to_me';
  if (person.owed < 0) return 'repaid_by_me';
  return 'lent';
}

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof ApiError && caught.errors?.length
    ? caught.errors[0]!.message
    : caught instanceof Error
      ? caught.message
      : fallback;

function LoanForm({
  person,
  accounts,
  today,
  onSaved,
  onCancel,
}: {
  person: Person;
  accounts: Account[];
  today: string;
  onSaved(): void;
  onCancel(): void;
}) {
  const active = accounts.filter((account) => !account.archived);
  const [direction, setDirection] = useState<LoanDirection>(likelyDirection(person));
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const moneyOut = direction === 'lent' || direction === 'repaid_by_me';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = toPaisa(amount);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    setBusy(true);
    setAmountError(undefined);
    setError(null);
    try {
      await money.createLoan({
        personId: person.id,
        direction,
        amount: parsed.paisa,
        accountId,
        date,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSaved();
    } catch (caught) {
      setError(messageOf(caught, 'Could not save. Try again.'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-5">
      <Select
        label="What happened"
        value={direction}
        onChange={(event) => setDirection(event.target.value as LoanDirection)}
      >
        {directions.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      <Field
        label="Amount"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        error={amountError}
      />
      <Select
        label="Account"
        value={accountId}
        onChange={(event) => setAccountId(event.target.value)}
      >
        {active.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </Select>
      <p className="-mt-3 text-xs text-sage">
        {moneyOut ? 'The money leaves this account.' : 'The money comes into this account.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Date"
          type="date"
          max={today}
          value={date}
          onChange={(event) => setDate(event.target.value || today)}
          className="[color-scheme:dark]"
        />
        <Field label="Note" autoComplete="off" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy} className="flex-1">
          Save
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Money lent and borrowed, person by person. None of it counts as spending. */
export function LoansView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const symbol = settings?.['general.currency'].symbol ?? '';
  const today = timeZone ? todayInZone(timeZone) : null;

  const [people, setPeople] = useState<Person[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Person | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Entry[] | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [loadedPeople, loadedAccounts] = await Promise.all([money.people(), money.accounts(true)]);
      setPeople(loadedPeople);
      setAccounts(loadedAccounts);
      setError(null);
    } catch (caught) {
      setError(messageOf(caught, 'Could not load.'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadHistory = useCallback(async (id: string) => {
    try {
      setHistory(await money.personHistory(id));
    } catch (caught) {
      setError(messageOf(caught, 'Could not load.'));
    }
  }, []);

  function toggle(person: Person) {
    if (openId === person.id) {
      setOpenId(null);
      return;
    }
    setOpenId(person.id);
    setHistory(null);
    void loadHistory(person.id);
  }

  const afterChange = useCallback(() => {
    setRecording(null);
    setOpenEntry(null);
    void refresh();
    if (openId) void loadHistory(openId);
  }, [refresh, loadHistory, openId]);

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding) return;
    const name = newName.trim();
    if (!name) {
      setNameError('Give them a name');
      return;
    }
    setAdding(true);
    setNameError(undefined);
    try {
      await money.createPerson(name);
      setNewName('');
      await refresh();
    } catch (caught) {
      setNameError(messageOf(caught, 'Could not add. Try again.'));
    } finally {
      setAdding(false);
    }
  }

  if (!today || people === null) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Opening the loans page…</p>
    );
  }

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const owedToMe = people.reduce((sum, person) => sum + Math.max(person.owed, 0), 0);
  const owedByMe = people.reduce((sum, person) => sum + Math.max(-person.owed, 0), 0);

  return (
    <>
      <FadeUp>
        <header className="mb-8">
          <h2 className="font-display text-2xl text-ivory md:text-3xl">Loans</h2>
          <p className="mt-2 max-w-prose text-sage">
            {owedToMe === 0 && owedByMe === 0
              ? 'Nothing is owed either way.'
              : `You are owed ${formatMoney(owedToMe, symbol)} and you owe ${formatMoney(owedByMe, symbol)}.`}{' '}
            Loans move your balances but are never counted as spending.
          </p>
        </header>
      </FadeUp>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {people.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">
          Nobody here yet. Add the first person below.
        </p>
      ) : (
        <ul aria-label="People" className="border-t border-hairline">
          {people.map((person, index) => (
            <motion.li
              key={person.id}
              className="border-b border-hairline"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: Math.min(index, 8) * 0.04 }}
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-expanded={openId === person.id}
                  onClick={() => toggle(person)}
                  className={`min-h-14 flex-1 py-3 text-left transition-colors duration-150 hover:text-brass ${
                    person.owed > 0 ? 'text-ivory' : person.owed < 0 ? 'text-alert' : 'text-sage'
                  }`}
                >
                  {owedText(person.name, person.owed, symbol)}
                </button>
                <Button
                  variant="quiet"
                  aria-label={`Record something with ${person.name}`}
                  onClick={() => setRecording(person)}
                  className="-mr-6 text-sm"
                >
                  Record
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {openId === person.id ? (
                  <motion.div
                    key="history"
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                  >
                    {history === null ? (
                      <p className="pb-4 text-sm text-sage">Loading…</p>
                    ) : history.length === 0 ? (
                      <p className="pb-4 text-sm text-sage">Nothing recorded with {person.name} yet.</p>
                    ) : (
                      <ul aria-label={`History with ${person.name}`} className="mb-3 border-t border-hairline pl-4">
                        {history.map((entry) => (
                          <li key={entry.id} className="border-b border-hairline last:border-b-0">
                            <EntryRow
                              entry={entry}
                              accountName={accountName.get(entry.accountId) ?? 'Account'}
                              symbol={symbol}
                              showDate
                              onOpen={() => setOpenEntry(entry)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      )}

      <form onSubmit={addPerson} method="post" noValidate className="mt-8 flex max-w-md items-end gap-3">
        <div className="flex-1">
          <Field
            label="New person"
            autoComplete="off"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            error={nameError}
          />
        </div>
        <Button type="submit" variant="outline" loading={adding}>
          Add person
        </Button>
      </form>

      <SheetPresence>
        {recording ? (
          <Sheet key="record" title={recording.name} onClose={() => setRecording(null)}>
            <LoanForm
              person={recording}
              accounts={accounts}
              today={today}
              onSaved={afterChange}
              onCancel={() => setRecording(null)}
            />
          </Sheet>
        ) : null}

        {openEntry ? (
          <EntrySheet
            key="entry"
            entry={openEntry}
            accounts={accounts}
            categories={[]}
            symbol={symbol}
            today={today}
            onClose={() => setOpenEntry(null)}
            onChanged={afterChange}
          />
        ) : null}
      </SheetPresence>
    </>
  );
}
