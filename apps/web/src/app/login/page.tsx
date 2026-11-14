import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FadeUp } from '@/components/motion/Stagger';
import { Wordmark } from '@/components/motion/Wordmark';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      {/* The one orchestrated moment: the name rises, a rule draws, the form settles. */}
      <Wordmark text="Personal" className="font-display text-5xl leading-none text-ivory" />
      <FadeUp delay={0.35}>
        <p className="mb-10 mt-4 text-sage">Your money, your habits and your files.</p>
      </FadeUp>
      <FadeUp delay={0.45}>
        <Suspense>
          <LoginForm />
        </Suspense>
      </FadeUp>
    </main>
  );
}
