import type { Metadata } from 'next';
import { StorageSettings } from './StorageSettings';

export const metadata: Metadata = { title: 'Storage settings' };

export default function StorageSettingsPage() {
  return <StorageSettings />;
}
