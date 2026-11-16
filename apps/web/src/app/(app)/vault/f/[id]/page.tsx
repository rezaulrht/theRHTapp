import type { Metadata } from 'next';
import { FolderPage } from './FolderPage';

export const metadata: Metadata = { title: 'Folder' };

export default async function VaultFolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FolderPage id={id} />;
}
