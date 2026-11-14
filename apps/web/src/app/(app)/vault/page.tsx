import type { Metadata } from 'next';
import { NotBuiltYet } from '@/components/NotBuiltYet';

export const metadata: Metadata = { title: 'Vault' };

export default function VaultPage() {
  return (
    <NotBuiltYet title="Vault">
      Your course material, saved explanations and work files will live here. This section is built after Habits.
    </NotBuiltYet>
  );
}
