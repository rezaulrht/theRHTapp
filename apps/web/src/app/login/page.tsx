import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-display text-4xl leading-none text-ivory">Personal</h1>
      <p className="mb-10 mt-3 text-sage">Your money, your habits and your files.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
