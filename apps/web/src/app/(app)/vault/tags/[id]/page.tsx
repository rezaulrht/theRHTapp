import type { Metadata } from 'next';
import { TagView } from './TagView';

export const metadata: Metadata = { title: 'Tag' };

export default async function VaultTagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TagView key={id} id={id} />;
}
