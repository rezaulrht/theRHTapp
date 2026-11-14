import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, Hanken_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const bodoni = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Personal', template: '%s | Personal' },
  description: 'Money, habits and files in one place.',
};

export const viewport: Viewport = {
  themeColor: '#0E2620',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
