import type { ReactNode } from 'react';
import { VaultNav } from './VaultNav';

export default function VaultLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VaultNav />
      {children}
    </>
  );
}
