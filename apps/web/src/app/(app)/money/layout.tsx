import type { ReactNode } from 'react';
import { MoneyNav } from './MoneyNav';

/** Day, Month and Loans share one heading and one set of tabs. */
export default function MoneyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Money</h1>
      <MoneyNav />
      {children}
    </>
  );
}
