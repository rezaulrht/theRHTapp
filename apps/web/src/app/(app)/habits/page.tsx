import type { Metadata } from 'next';
import { DayView } from './DayView';

export const metadata: Metadata = { title: 'Habits' };

export default function HabitsPage() {
  return <DayView />;
}
