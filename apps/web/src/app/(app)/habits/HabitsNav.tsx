import { SectionTabs } from '@/components/SectionTabs';

const views = [
  { href: '/habits', label: 'Day' },
  { href: '/habits/progress', label: 'Progress' },
];

/** The two views of Habits. */
export function HabitsNav() {
  return <SectionTabs label="Habits" tabs={views} />;
}
