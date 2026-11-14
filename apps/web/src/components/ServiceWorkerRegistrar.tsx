'use client';

import { useEffect } from 'react';

/** Registers the service worker, which shows notifications and the offline page. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app works without it; only notifications and the offline page are lost.
    });
  }, []);
  return null;
}
