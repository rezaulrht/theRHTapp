'use client';

import { useEffect } from 'react';
import { syncPush } from '@/lib/push';

/**
 * Each time the app opens behind the login, makes sure the server still knows
 * about this phone's notification registration. Shows nothing.
 */
export function PushSync() {
  useEffect(() => {
    void syncPush();
  }, []);
  return null;
}
