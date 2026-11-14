import type { Metadata } from 'next';
import { SecurityForm } from './SecurityForm';

export const metadata: Metadata = { title: 'Security settings' };

export default function SecuritySettingsPage() {
  return <SecurityForm />;
}
