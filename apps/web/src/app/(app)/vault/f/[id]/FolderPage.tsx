'use client';

import { FolderView } from '../../_parts/FolderView';

/** One folder of the Vault. */
export function FolderPage({ id }: { id: string }) {
  return <FolderView key={id} id={id} />;
}
