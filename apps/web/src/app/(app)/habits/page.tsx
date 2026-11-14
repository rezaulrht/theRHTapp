import type { Metadata } from 'next';
import { NotBuiltYet } from '@/components/NotBuiltYet';

export const metadata: Metadata = { title: 'Habits' };

export default function HabitsPage() {
  return (
    <NotBuiltYet title="Habits">
      Your daily routine, reminders and score will live here. This section is built after Money.
    </NotBuiltYet>
  );
}
