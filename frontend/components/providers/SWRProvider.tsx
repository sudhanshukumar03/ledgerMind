'use client';

import React, { createContext, useContext, useState } from 'react';
import { SWRConfig } from 'swr';

const SWRTimeContext = createContext<number | null>(null);

export const useLastUpdated = () => useContext(SWRTimeContext);

export function SWRProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  return (
    <SWRTimeContext.Provider value={lastUpdated}>
      <SWRConfig 
        value={{
          refreshInterval: 30000, // 30s default
          revalidateOnFocus: true,
          onSuccess: () => {
            setLastUpdated(Date.now());
          }
        }}
      >
        {children}
      </SWRConfig>
    </SWRTimeContext.Provider>
  );
}
