import type { ReactNode } from 'react';
import { SettingsNav } from './SettingsNav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="mb-6 font-display text-4xl leading-tight text-ivory md:text-5xl">Settings</h1>
      <SettingsNav />
      {children}
    </>
  );
}
