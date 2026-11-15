import type { Metadata } from 'next';
import { HabitsSettings } from './HabitsSettings';

export const metadata: Metadata = { title: 'Habits settings' };

export default function HabitsSettingsPage() {
  return <HabitsSettings />;
}
