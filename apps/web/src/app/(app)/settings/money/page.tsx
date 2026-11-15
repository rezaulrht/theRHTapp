import type { Metadata } from 'next';
import { MoneySettings } from './MoneySettings';

export const metadata: Metadata = { title: 'Money settings' };

export default function MoneySettingsPage() {
  return <MoneySettings />;
}
