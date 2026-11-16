import type { Metadata } from 'next';
import { TrashView } from './TrashView';

export const metadata: Metadata = { title: 'Trash' };

export default function VaultTrashPage() {
  return <TrashView />;
}
