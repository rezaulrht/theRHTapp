import type { Metadata } from 'next';
import { DayView } from './DayView';
import { MoneyNav } from './MoneyNav';

export const metadata: Metadata = { title: 'Money' };

export default function MoneyPage() {
  return (
    <>
      <h1 className="sr-only">Money</h1>
      <MoneyNav />
      <DayView />
    </>
  );
}
