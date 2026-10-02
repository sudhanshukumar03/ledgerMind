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
      className="grid grid-cols-3 items-center gap-4 px-8 h-[64px] shrink-0 sticky top-0 z-10 backdrop-blur-xl"
      style={{ backgroundColor: `${C.surface}E6`, borderBottom: `1px solid ${C.border}` }}
    >
      <h1
        className="text-[18px] font-semibold m-0 leading-none whitespace-nowrap col-start-1 justify-self-start"
        style={{ color: C.textPrimary }}
      >
        {title}
      </h1>

      {/* Global Search — centered */}
      <div
        className="hidden md:flex items-center w-full max-w-md relative cursor-text group col-start-2 justify-self-center"
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

      {/* Right: action + live status, right-aligned with symmetric px-8 padding */}
      <div className="flex items-center gap-3 col-start-3 justify-self-end">
        {action}
        <LiveIndicator />
      </div>
    </header>
  );
}
