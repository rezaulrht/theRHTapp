import type { Metadata } from 'next';
import { GeneralForm } from './GeneralForm';

export const metadata: Metadata = { title: 'General settings' };

export default function GeneralSettingsPage() {
  return <GeneralForm />;
}
