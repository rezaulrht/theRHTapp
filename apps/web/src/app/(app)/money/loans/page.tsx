import type { Metadata } from 'next';
import { LoansView } from './LoansView';

export const metadata: Metadata = { title: 'Loans' };

export default function MoneyLoansPage() {
  return <LoansView />;
}
