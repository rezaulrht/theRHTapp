'use client';

import { Button, Field, Select } from '@pa/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ai } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import {
  money,
  paisaToInput,
  toPaisa,
  type Account,
  type Category,
  type Entry,
  type NameSuggestion,
} from '@/lib/money';

type FormKind = 'expense' | 'income' | 'transfer';

export interface EntryFormProps {
  /** Include archived ones so an old entry can still show what it used. */
  accounts: Account[];
  categories: Category[];
  /** An entry to edit. Leave out to add a new one. */
  initial?: Entry;
  /** Starting values for a new entry, such as a shortcut whose amount is being changed. */
  preset?: { name: string; amount: number; accountId: string; categoryId: string };
  /** The date a new entry starts on, 'YYYY-MM-DD'. */
  defaultDate: string;
  /** The latest date allowed: today in the owner's time zone. Defaults to `defaultDate`. */
  maxDate?: string;
  onSaved(entry: Entry): void;
  onCancel(): void;
}

const LAST_ACCOUNT_KEY = 'pa.money.lastAccount';

const KINDS: { kind: FormKind; label: string }[] = [
  { kind: 'expense', label: 'Expense' },
  { kind: 'income', label: 'Income' },
  { kind: 'transfer', label: 'Move money' },
];

const SAVE_LABEL: Record<FormKind, string> = {
  expense: 'Add expense',
  income: 'Add income',
  transfer: 'Move money',
};

function lastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

/** The form for adding or editing an expense, income or transfer. */
export function EntryForm({
  accounts,
  categories,
  initial,
  preset,
  defaultDate,
  maxDate = defaultDate,
  onSaved,
  onCancel,
}: EntryFormProps) {
  const editing = initial !== undefined;
  const activeAccounts = accounts.filter((account) => !account.archived);
  const firstAccount =
    activeAccounts.find((account) => account.id === lastAccount())?.id ?? activeAccounts[0]?.id ?? '';

  const [kind, setKind] = useState<FormKind>((initial?.kind as FormKind | undefined) ?? 'expense');
  const [amount, setAmount] = useState(
    initial ? paisaToInput(initial.amount) : preset ? paisaToInput(preset.amount) : '',
  );
  const [name, setName] = useState(initial?.name ?? preset?.name ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? preset?.accountId ?? firstAccount);
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId ?? activeAccounts.find((account) => account.id !== firstAccount)?.id ?? '',
  );
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ??
      preset?.categoryId ??
      categories.find((category) => !category.archived && !category.isFees)?.id ?? '',
  );
  const [fee, setFee] = useState(initial?.fee ? paisaToInput(initial.fee.amount) : '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [note, setNote] = useState(initial?.note ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  const latestLookup = useRef(0);

  // The sentence box shows only when the assistant is set up on the server.
  const [assistant, setAssistant] = useState(false);
  const [sentence, setSentence] = useState('');
  const [reading, setReading] = useState(false);
  const [sentenceNote, setSentenceNote] = useState<{ text: string; problem: boolean } | null>(null);

  useEffect(() => {
    if (editing) return;
    ai.status()
      .then((status) => setAssistant(status.enabled))
      .catch(() => setAssistant(false));
  }, [editing]);

  // Archived accounts and categories are offered only if this entry already uses them.
  const accountOptions = accounts.filter(
    (account) => !account.archived || account.id === initial?.accountId || account.id === initial?.toAccountId,
  );
  const categoryOptions = categories.filter(
    (category) => (!category.archived && !category.isFees) || category.id === initial?.categoryId,
  );

  // Past names that match what is being typed, each with the account and category it last used.
  useEffect(() => {
    if (kind !== 'expense' || name.trim() === '' || name === initial?.name || name === preset?.name) {
      setSuggestions([]);
      return;
    }
    const lookup = ++latestLookup.current;
    money
      .names(name.trim())
      .then((found) => {
        // Ignore an answer that a newer keystroke has overtaken.
        if (lookup === latestLookup.current) setSuggestions(found.filter((item) => item.name !== name));
      })
      .catch(() => {});
  }, [kind, name, initial?.name, preset?.name]);

  function pick(suggestion: NameSuggestion) {
    setName(suggestion.name);
    if (activeAccounts.some((account) => account.id === suggestion.accountId)) setAccountId(suggestion.accountId);
    if (suggestion.categoryId && categoryOptions.some((category) => category.id === suggestion.categoryId)) {
      setCategoryId(suggestion.categoryId);
    }
    if (amount.trim() === '') setAmount(paisaToInput(suggestion.amount));
    setSuggestions([]);
  }

  /** Reads the sentence and fills the form from it. Nothing is saved: the person checks it and adds it. */
  async function fillFromSentence() {
    if (reading || sentence.trim() === '') return;
    setReading(true);
    setSentenceNote(null);
    try {
      const found = await ai.parseExpense(sentence.trim());
      setKind('expense');
      setAmount(paisaToInput(found.amount));
      setName(found.name);
      setDate(found.date > maxDate ? maxDate : found.date);
      if (found.accountId && activeAccounts.some((account) => account.id === found.accountId)) setAccountId(found.accountId);
      if (found.categoryId && categoryOptions.some((category) => category.id === found.categoryId)) setCategoryId(found.categoryId);
      setErrors({});
      setSentenceNote({ text: 'Filled in below. Check it, then add it.', problem: false });
    } catch (error) {
      setSentenceNote({ text: error instanceof Error ? error.message : 'Could not read that. Fill it in by hand.', problem: true });
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const problems: Record<string, string> = {};
    const parsed = toPaisa(amount);
    if (!parsed.ok) problems.amount = parsed.message;

    let feePaisa: number | undefined;
    if (kind === 'transfer') {
      if (accountId === toAccountId) problems.toAccountId = 'Pick a different account to move money to';
      if (fee.trim() !== '') {
        const parsedFee = toPaisa(fee);
        if (parsedFee.ok) feePaisa = parsedFee.paisa;
        else problems.fee = parsedFee.message;
      } else if (editing) {
        feePaisa = 0; // an emptied fee field removes the fee
      }
    } else if (name.trim() === '') {
      problems.name = kind === 'expense' ? 'Say what it was for' : 'Say where it came from';
    }

    setErrors(problems);
    setFormError(null);
    if (Object.keys(problems).length > 0 || !parsed.ok) return;

    const body: Record<string, unknown> = { date, amount: parsed.paisa };
    if (kind === 'transfer') {
      body.accountId = accountId;
      body.toAccountId = toAccountId;
      if (feePaisa !== undefined) body.fee = feePaisa;
    } else {
      body.name = name.trim();
      body.accountId = accountId;
      if (kind === 'expense') body.categoryId = categoryId;
    }
    if (editing) body.note = note.trim() || null;
    else if (note.trim()) body.note = note.trim();

    setBusy(true);
    try {
      const entry = editing
        ? await money.updateEntry(initial.id, body)
        : await money.createEntry({ kind, ...body });
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      } catch {
        // Private browsing: the default account just will not be remembered.
      }
      onSaved(entry);
    } catch (error) {
      if (error instanceof ApiError && error.errors?.length) {
        setErrors(Object.fromEntries(error.errors.map((item) => [item.path, item.message])));
      } else {
        setFormError(error instanceof Error ? error.message : 'Could not save. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const options = accountOptions.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name}
    </option>
  ));

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-5">
      {editing ? null : (
        <fieldset>
          <legend className="sr-only">Kind of entry</legend>
          <div className="grid grid-cols-3 rounded-full border border-hairline p-1">
            {KINDS.map((option) => (
              <label
                key={option.kind}
                className="relative flex min-h-10 cursor-pointer items-center justify-center rounded-full text-sm text-sage transition-colors duration-200 has-[:checked]:bg-brass has-[:checked]:text-ground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brass"
              >
                <input
                  type="radio"
                  name="kind"
                  className="sr-only"
                  checked={kind === option.kind}
                  onChange={() => {
                    setKind(option.kind);
                    setErrors({});
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {assistant && !editing ? (
        <div>
          <div className="flex items-end gap-2">
            <Field
              label="Say it in a sentence"
              autoComplete="off"
              placeholder="Lunch 250 bkash"
              value={sentence}
              onChange={(event) => setSentence(event.target.value)}
              onKeyDown={(event) => {
                // Enter here reads the sentence; it does not add the entry.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void fillFromSentence();
                }
              }}
              className="flex-1"
            />
            <Button variant="outline" loading={reading} onClick={() => void fillFromSentence()}>
              Fill in
            </Button>
          </div>
          {sentenceNote ? (
            <p role={sentenceNote.problem ? 'alert' : 'status'} className={`mt-2 text-sm ${sentenceNote.problem ? 'text-alert' : 'text-brass'}`}>
              {sentenceNote.text}
            </p>
          ) : null}
        </div>
      ) : null}

      <Field
        label="Amount"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        error={errors.amount}
        className="[&_input]:font-display [&_input]:text-3xl [&_input]:min-h-16"
      />

      {kind === 'transfer' ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Select label="From" value={accountId} onChange={(event) => setAccountId(event.target.value)} error={errors.accountId}>
              {options}
            </Select>
            <Select label="To" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} error={errors.toAccountId}>
              {options}
            </Select>
          </div>
          <Field
            label="Fee, if any"
            inputMode="decimal"
            autoComplete="off"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            error={errors.fee}
            hint="For example a bKash cash-out charge. It is recorded as its own expense."
          />
        </>
      ) : (
        <>
          <div>
            <Field
              label={kind === 'expense' ? 'What was it for?' : 'Where did it come from?'}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
            />
            {suggestions.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.name}>
                    <button
                      type="button"
                      onClick={() => pick(suggestion)}
                      className="min-h-9 rounded-full border border-hairline px-3 text-sm text-ivory transition-colors duration-150 hover:border-brass"
                    >
                      {suggestion.name}{' '}
                      <span className="text-sage tabular-nums">{paisaToInput(suggestion.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={kind === 'expense' ? 'grid grid-cols-2 gap-4' : ''}>
            <Select
              label={kind === 'expense' ? 'Paid from' : 'Paid into'}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              error={errors.accountId}
            >
              {options}
            </Select>
            {kind === 'expense' ? (
              <Select
                label="Category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                error={errors.categoryId}
              >
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Date"
          type="date"
          max={maxDate}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          error={errors.date}
        />
        <Field label="Note" value={note} onChange={(event) => setNote(event.target.value)} error={errors.note} />
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-alert">
          {formError}
        </p>
      ) : null}

      <div className="mt-1 flex items-center gap-3">
        <Button type="submit" loading={busy} className="flex-1">
          {editing ? 'Save changes' : SAVE_LABEL[kind]}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
