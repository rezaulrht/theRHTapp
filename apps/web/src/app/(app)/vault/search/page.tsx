import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView } from './SearchView';

export const metadata: Metadata = { title: 'Search' };

export default function VaultSearchPage() {
  return (
    <Suspense fallback={<p className="text-sage">Searching…</p>}>
      <SearchView />
    </Suspense>
  );
}
