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
      <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mb-6 rounded-2xl" />
      <Wordmark text="The R.H.T App" className="font-display text-3xl leading-none sm:text-4xl text-ivory" />
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
