import type { ReactNode } from 'react';
import { HabitsNav } from './HabitsNav';

/** The day and the progress page share one heading and one set of tabs. */
export default function HabitsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Habits</h1>
      <HabitsNav />
      {children}
    </>
  );
}
