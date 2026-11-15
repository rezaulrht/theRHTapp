import type { Metadata } from 'next';
import { DayView } from './DayView';

export const metadata: Metadata = { title: 'Money' };

export default function MoneyPage() {
  return <DayView />;
}
