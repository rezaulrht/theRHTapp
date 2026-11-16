'use client';

import { useEffect, useState } from 'react';
import { vault, type VaultHome } from '@/lib/vault';
import { EntryList } from './_parts/EntryList';
import { FolderView } from './_parts/FolderView';

/** Pinned and recent things, shown above the top level of the Vault. */
function Shortcuts() {
  const [home, setHome] = useState<VaultHome | null>(null);

  useEffect(() => {
    vault
      .home()
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  if (!home) return null;
  const pinned = home.pinned.folders.length + home.pinned.items.length > 0;
  return (
    <>
      {pinned ? (
        <section aria-labelledby="pinned-heading" className="mb-10">
          <h2 id="pinned-heading" className="mb-2 font-display text-xl text-ivory">
            Pinned
          </h2>
          <EntryList label="Pinned" folders={home.pinned.folders} items={home.pinned.items} showPath />
        </section>
      ) : null}
      {home.recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="mb-10">
          <h2 id="recent-heading" className="mb-2 font-display text-xl text-ivory">
            Recent
          </h2>
          <EntryList label="Recent" folders={[]} items={home.recent.slice(0, 6)} showPath />
        </section>
      ) : null}
      {pinned || home.recent.length > 0 ? <h2 className="mb-3 font-display text-xl text-ivory">Everything</h2> : null}
    </>
  );
}

/** The front page of the Vault. */
export function HomeView() {
  return <FolderView id="root" before={<Shortcuts />} />;
}
