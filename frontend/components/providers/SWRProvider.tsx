'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { SWRConfig } from 'swr';

interface SWRContextValue {
  lastUpdated: number | null;
  inProgressRun: boolean;
  setInProgressRun: (val: boolean) => void;
}

const SWRTimeContext = createContext<SWRContextValue>({
  lastUpdated: null,
  inProgressRun: false,
  setInProgressRun: () => {},
});

export const useLastUpdated = () => useContext(SWRTimeContext).lastUpdated;
export const useInProgressRun = () => useContext(SWRTimeContext).inProgressRun;
export const useSetInProgressRun = () => useContext(SWRTimeContext).setInProgressRun;

export function SWRProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [inProgressRun, setInProgressRun] = useState(false);

  const handleSuccess = useCallback(() => {
    setLastUpdated(Date.now());
  }, []);

  // Adaptive interval: 3s during active run, 30s otherwise
  const refreshInterval = inProgressRun ? 3000 : 30000;

  return (
    <SWRTimeContext.Provider value={{ lastUpdated, inProgressRun, setInProgressRun }}>
      <SWRConfig
        value={{
          refreshInterval,
          revalidateOnFocus: true,
          onSuccess: handleSuccess,
        }}
      >
        {children}
      </SWRConfig>
    </SWRTimeContext.Provider>
  );
}
