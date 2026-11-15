'use client';

import { Button, Field, Select } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { money, toPaisa, type Account } from '@/lib/money';
import { formatMoney } from '@/lib/money-text';

/** A balance as typed, allowing zero and a minus sign for an overdrawn account. */
function readBalance(text: string): { ok: true; paisa: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (/^-?0*(\.0*)?$/.test(trimmed) && /0/.test(trimmed)) return { ok: true, paisa: 0 };
  const negative = trimmed.startsWith('-');
  const parsed = toPaisa(negative ? trimmed.slice(1) : trimmed);
  return parsed.ok ? { ok: true, paisa: negative ? -parsed.paisa : parsed.paisa } : parsed;
}

/**
 * When the app and the wallet disagree: enter what is really there and the
 * difference is recorded as a correction.
 */
export function FixBalanceForm({
  accounts,
  symbol,
  date,
  onSaved,
  onCancel,
}: {
  accounts: Account[];
  symbol: string;
  date: string;
  onSaved(): void;
  onCancel(): void;
}) {
  const active = accounts.filter((account) => !account.archived);
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const current = active.find((account) => account.id === accountId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = readBalance(balance);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await money.createEntry({ kind: 'correction', date, accountId, trueBalance: parsed.paisa });
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.errors?.length
          ? caught.errors[0]!.message
          : caught instanceof Error
            ? caught.message
            : 'Could not save. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-5">
      <Select label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
        {active.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </Select>
      <Field
        label="What is really there"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        value={balance}
        onChange={(event) => setBalance(event.target.value)}
        error={error}
        hint={current ? `The app says ${formatMoney(current.balance, symbol)}. The difference is recorded as a correction.` : undefined}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy} className="flex-1">
          Set balance
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
