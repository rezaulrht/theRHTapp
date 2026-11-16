'use client';

import { useEffect, useState } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { vault, type VaultItem, type VaultTag } from '@/lib/vault';
import { EntryList } from '../../_parts/EntryList';

/** Everything with one tag, wherever it is filed. */
export function TagView({ id }: { id: string }) {
  const [data, setData] = useState<{ tag: VaultTag; items: VaultItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vault
      .tagItems(id)
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'));
  }, [id]);

  if (!data) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Opening…</p>
    );
  }

  return (
    <>
      <p className="text-sm text-sage">Tag</p>
      <h1 className="mb-6 font-display text-4xl leading-tight text-ivory md:text-5xl">
        <Reveal>{data.tag.name}</Reveal>
      </h1>
      {data.items.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">Nothing has this tag yet.</p>
      ) : (
        <EntryList label="Tagged" folders={[]} items={data.items} showPath />
      )}
    </>
  );
}
