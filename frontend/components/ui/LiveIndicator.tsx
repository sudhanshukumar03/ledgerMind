'use client';

import React, { useEffect, useState } from 'react';
import { useLastUpdated } from '../providers/SWRProvider';
import { C } from '../../lib/tokens';

export function LiveIndicator() {
  const lastUpdated = useLastUpdated();
  const [text, setText] = useState('Updating...');

  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateText = () => {
      const diff = Math.floor((Date.now() - lastUpdated) / 1000);
      if (diff < 5) setText('Just updated');
      else if (diff < 60) setText(`Updated ${diff}s ago`);
      else setText(`Updated ${Math.floor(diff / 60)}m ago`);
    };

    updateText();
    const interval = setInterval(updateText, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: C.textMuted }}>
      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.success }} />
      {text}
    </div>
  );
}
