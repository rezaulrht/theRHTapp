'use client';

import { useEffect, useState } from 'react';
import { ai } from '@/lib/ai';

/**
 * True when the assistant is set up on the server. Buttons that need it show only then.
 * The last known answer is used at once, so nothing pops in late on a slow connection.
 */
export function useAssistant(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let current = true;
    ai.statusSwr((status) => {
      if (current) setEnabled(status.enabled);
    }).catch(() => {
      if (current) setEnabled(false);
    });
    return () => {
      current = false;
    };
  }, []);

  return enabled;
}
