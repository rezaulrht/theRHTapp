'use client';

import { Amount, Button } from '@pa/ui';
import type { Account } from '@/lib/money';

/** Every active account's balance, side by side, as in the notebook margin. */
export function BalanceStrip({
  accounts,
  symbol,
  onFix,
}: {
  accounts: Account[];
  symbol: string;
  onFix(): void;
}) {
  const active = accounts.filter((account) => !account.archived);
  return (
    <section className="mb-8">
      <ul
        aria-label="Balances"
        className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] border-y border-hairline"
      >
        {active.map((account) => (
          <li
            key={account.id}
            className="flex flex-col items-center gap-1 px-2 py-4 text-center [&+&]:border-l [&+&]:border-hairline"
          >
            <span className="text-xs text-sage">{account.name}</span>
            <Amount
              value={account.balance / 100}
              currency={symbol}
              animate
              className={`text-xl md:text-2xl ${account.balance < 0 ? 'text-alert' : 'text-ivory'}`}
            />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <Button variant="quiet" onClick={onFix} className="-mr-6 min-h-9 text-xs">
          Fix a balance
        </Button>
      </div>
    </section>
  );
}
