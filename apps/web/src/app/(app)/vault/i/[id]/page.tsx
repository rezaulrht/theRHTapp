import type { Metadata } from 'next';
import { ItemView } from '../../_parts/ItemView';

export const metadata: Metadata = { title: 'Vault' };

export default async function VaultItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemView key={id} id={id} />;
}
