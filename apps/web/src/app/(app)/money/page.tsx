import type { Metadata } from 'next';
import { NotBuiltYet } from '@/components/NotBuiltYet';

export const metadata: Metadata = { title: 'Money' };

export default function MoneyPage() {
  return (
    <NotBuiltYet title="Money">
      Your accounts, daily spending and monthly picture will live here. This section is built next.
    </NotBuiltYet>
  );
}
