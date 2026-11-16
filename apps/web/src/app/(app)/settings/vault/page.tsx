import type { Metadata } from 'next';
import { VaultSettings } from './VaultSettings';

export const metadata: Metadata = { title: 'Vault settings' };

export default function VaultSettingsPage() {
  return <VaultSettings />;
}
