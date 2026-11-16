'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SectionTabs } from '@/components/SectionTabs';

const views = [
  { href: '/vault', label: 'Home' },
  { href: '/vault/calendar', label: 'Calendar' },
  { href: '/vault/trash', label: 'Trash' },
];

/** The Vault's views, and one search box that covers everything in it. */
export function VaultNav() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (q.trim()) router.push(`/vault/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-x-6">
      <SectionTabs label="Vault" tabs={views} />
      <form role="search" onSubmit={search} className="mb-8 w-full sm:w-72">
        <label htmlFor="vault-search" className="sr-only">
          Search the Vault
        </label>
        <input
          id="vault-search"
          type="search"
          placeholder="Search the Vault"
          autoComplete="off"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="min-h-11 w-full rounded-full border border-hairline bg-transparent px-4 text-sm text-ivory placeholder:text-sage/70 transition-colors duration-150 focus:border-brass"
        />
      </form>
    </div>
  );
}
