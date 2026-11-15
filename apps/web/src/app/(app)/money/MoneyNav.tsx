import { SectionTabs } from '@/components/SectionTabs';

const views = [
  { href: '/money', label: 'Day' },
  { href: '/money/month', label: 'Month' },
  { href: '/money/loans', label: 'Loans' },
];

/** The three views of Money. */
export function MoneyNav() {
  return <SectionTabs label="Money" tabs={views} />;
}
