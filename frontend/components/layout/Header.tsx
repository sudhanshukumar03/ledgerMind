'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { C } from '../../lib/tokens';
import { LiveIndicator } from '../ui/LiveIndicator';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  return (
    <header 
      className="flex items-center justify-between px-8 h-[64px] shrink-0 sticky top-0 z-10"
      style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-6 flex-1">
        <h1 
          className="text-[18px] font-semibold m-0 leading-none"
          style={{ color: C.textPrimary }}
        >
          {title}
        </h1>
        
        {/* Global Search */}
        <div 
          className="hidden md:flex items-center max-w-md w-full relative cursor-text group"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        >
          <Search className="w-4 h-4 absolute left-3" style={{ color: C.textMuted }} />
          <div
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md transition-colors"
            style={{ 
              backgroundColor: C.bg, 
              border: `1px solid ${C.border}`,
              color: C.textMuted
            }}
          >
            Search pages...
          </div>
          <div className="absolute right-2 flex items-center gap-1 group-hover:opacity-100 opacity-70 transition-opacity">
            <kbd className="px-1.5 py-0.5 text-[10px] rounded font-mono shadow-sm" style={{ backgroundColor: C.surface, color: C.textSecondary, border: `1px solid ${C.border}` }}>⌘</kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] rounded font-mono shadow-sm" style={{ backgroundColor: C.surface, color: C.textSecondary, border: `1px solid ${C.border}` }}>K</kbd>
          </div>
        </div>
        <LiveIndicator />
      </div>

      {action && (
        <div className="flex items-center gap-3">
          {action}
        </div>
      )}
    </header>
  );
}
