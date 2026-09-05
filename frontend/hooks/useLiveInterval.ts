/**
 * useLiveInterval
 *
 * Returns the appropriate SWR refreshInterval:
 *   - 0     when the browser tab is hidden (pause polling)
 *   - 3000  when a reconciliation run is IN_PROGRESS
 *   - 30000 otherwise (30s steady-state)
 *
 * Also triggers an immediate SWR revalidation when the tab becomes visible again.
 */
'use client';

import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { useInProgressRun } from '../components/providers/SWRProvider';

export function useLiveInterval(): number {
  const inProgressRun = useInProgressRun();
  const [isVisible, setIsVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      const nowVisible = document.visibilityState === 'visible';
      setIsVisible(nowVisible);

      if (nowVisible) {
        // Revalidate all SWR keys immediately on tab focus
        mutate(() => true, undefined, { revalidate: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (!isVisible) return 0;           // pause while hidden
  if (inProgressRun) return 3000;     // fast poll during active run
  return 30000;                        // steady-state
}
