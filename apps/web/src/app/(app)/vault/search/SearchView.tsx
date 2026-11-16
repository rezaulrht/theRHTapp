'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { vault, type Matched, type VaultFolder, type VaultItem } from '@/lib/vault';
import { itemMeta, matchedText } from '@/lib/vault-text';
import { KindIcon } from '../_parts/KindIcon';

type Result = (VaultFolder & { matched: Matched; kind: 'folder' }) | (VaultItem & { matched: Matched });

/** Where something is, as words: "Education › Physics". */
const where = (path: { name: string }[]) => (path.length > 0 ? path.map((step) => step.name).join(' › ') : 'Top level');

/** Everything in the Vault that matches, folders first, each with where it is and why it matched. */
export function SearchView() {
  const q = (useSearchParams().get('q') ?? '').trim();
  const [results, setResults] = useState<{ q: string; list: Result[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q) return;
    let current = true;
    vault
      .search(q)
      .then((found) => {
        if (!current) return;
        setResults({
          q,
          list: [...found.folders.map((folder) => ({ ...folder, kind: 'folder' as const })), ...found.items],
        });
        setError(null);
      })
      .catch((caught: unknown) => current && setError(caught instanceof Error ? caught.message : 'Could not search.'));
    return () => {
      current = false;
    };
  }, [q]);

  return (
    <>
      <h1 className="mb-6 font-display text-4xl leading-tight text-ivory md:text-5xl">
        <Reveal key={q}>{q ? `“${q}”` : 'Search'}</Reveal>
      </h1>
      {error ? (
        <p role="alert" className="text-alert">
          {error}
        </p>
      ) : null}
      {!q ? (
        <p className="text-sage">Search names, notes, links, tags and field values from the box above.</p>
      ) : results === null || results.q !== q ? (
        <p className="text-sage">Searching…</p>
      ) : results.list.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">Nothing matches. File contents, such as the text inside a PDF, are not searched.</p>
      ) : (
        <ul aria-label="Results" className="border-t border-hairline">
          {results.list.map((result, index) => {
            const isFolder = result.kind === 'folder';
            const path = isFolder ? result.path.slice(0, -1) : result.path;
            return (
              <motion.li
                key={`${result.kind}:${result.id}`}
                className="border-b border-hairline"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: Math.min(index, 12) * 0.03 }}
              >
                <Link
                  href={isFolder ? `/vault/f/${result.id}` : `/vault/i/${result.id}`}
                  className="group flex min-h-14 items-center gap-3 py-2.5 transition-colors duration-150"
                >
                  <KindIcon kind={result.kind} className="shrink-0 text-brass" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ivory group-hover:text-brass">{result.name}</span>
                    <span className="block truncate text-sm text-sage">
                      {where(path)}
                      {isFolder ? '' : ` · ${itemMeta(result as VaultItem)}`}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline px-2.5 py-0.5 text-xs text-sage">{matchedText(result.matched)}</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </>
  );
}
