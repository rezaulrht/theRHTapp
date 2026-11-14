import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, Hanken_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import './globals.css';

const bodoni = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Personal', template: '%s | Personal' },
  description: 'Money, habits and files in one place.',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  // Lets iOS open the app full screen from the home screen.
  appleWebApp: { capable: true, title: 'Personal', statusBarStyle: 'black-translucent' },
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
      <body>
        <OfflineBanner />
        <ServiceWorkerRegistrar />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
