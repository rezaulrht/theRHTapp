import type { ReactNode } from 'react';
import { PageTransition } from '@/components/PageTransition';

// A template remounts on every navigation, which is what replays the transition.
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
