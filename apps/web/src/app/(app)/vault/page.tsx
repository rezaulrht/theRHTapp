import type { Metadata } from 'next';
import { HomeView } from './HomeView';

export const metadata: Metadata = { title: 'Vault' };

export default function VaultPage() {
  return <HomeView />;
}
