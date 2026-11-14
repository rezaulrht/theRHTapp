import type { Metadata } from 'next';
import { NotBuiltYet } from '@/components/NotBuiltYet';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <NotBuiltYet title="Settings">Settings are being built.</NotBuiltYet>;
}
