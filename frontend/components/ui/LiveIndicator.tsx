'use client';

import React, { useEffect, useState } from 'react';
import { useLastUpdated } from '../providers/SWRProvider';
import { C } from '../../lib/tokens';

export function LiveIndicator() {
  const lastUpdated = useLastUpdated();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Single shared 1s ticker for the whole app
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastUpdated) {
    return (
      <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: C.warning }}>
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.warning }} />
        Reconnecting…
      </div>
    );
  }

  const diffSec = Math.floor((now - lastUpdated) / 1000);
  const isStale = diffSec >= 60;

  let label: string;
  if (diffSec < 5) label = 'Just updated';
  else if (diffSec < 60) label = `Updated ${diffSec}s ago`;
  else label = `Updated ${Math.floor(diffSec / 60)}m ago`;

  const color = isStale ? C.warning : C.textMuted;

  return (
    <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color }}>
      <div
        className={`w-1.5 h-1.5 rounded-full${isStale ? ' animate-pulse' : ''}`}
        style={{ backgroundColor: isStale ? C.warning : C.success }}
      />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
