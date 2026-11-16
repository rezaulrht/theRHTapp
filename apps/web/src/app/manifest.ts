import type { MetadataRoute } from 'next';

// The full name, and the shorter one shown under the home-screen icon. Change them here.
const APP_NAME = 'The R.H.T App';
const SHORT_NAME = 'R.H.T';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: SHORT_NAME,
    description: 'Money, habits and files in one place.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    background_color: '#0E2620',
    theme_color: '#0E2620',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
