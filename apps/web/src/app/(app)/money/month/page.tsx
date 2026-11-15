import type { Metadata } from 'next';
import { MonthView } from './MonthView';

export const metadata: Metadata = { title: 'Month' };

export default function MoneyMonthPage() {
  return <MonthView />;
}
