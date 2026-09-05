'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { C } from '../../lib/tokens';
import { Search, Home, Activity, ListOrdered, FileText, Zap, Bot, Settings, X } from 'lucide-react';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  title: string;
  href: string;
  icon: React.ReactNode;
  category: string;
}

const STATIC_ROUTES: SearchResult[] = [
  { title: 'Dashboard', href: '/', icon: <Home className="w-4 h-4" />, category: 'Pages' },
  { title: 'Exceptions', href: '/exceptions', icon: <Activity className="w-4 h-4" />, category: 'Pages' },
  { title: 'Reconciliation', href: '/reconciliation', icon: <Activity className="w-4 h-4" />, category: 'Pages' },
  { title: 'Transactions', href: '/transactions', icon: <ListOrdered className="w-4 h-4" />, category: 'Pages' },
  { title: 'Webhooks', href: '/webhooks', icon: <FileText className="w-4 h-4" />, category: 'Pages' },
  { title: 'Actions', href: '/actions', icon: <Zap className="w-4 h-4" />, category: 'Pages' },
  { title: 'AI Controller', href: '/ai-controller', icon: <Bot className="w-4 h-4" />, category: 'Pages' },
];

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const results = STATIC_ROUTES.filter(route => 
    route.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        router.push(results[selectedIndex].href);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 border-b" style={{ borderColor: C.border }}>
          <Search className="w-5 h-5" style={{ color: C.textMuted }} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 h-14 bg-transparent outline-none px-4 text-[15px]"
            style={{ color: C.textPrimary }}
            placeholder="Search pages..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={onClose} className="p-2 rounded-md transition-colors hover-bg-muted" style={{ color: C.textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length > 0 ? (
            <div className="px-2">
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
                Pages
              </div>
              {results.map((item, i) => (
                <button
                  key={item.href}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{ 
                    backgroundColor: i === selectedIndex ? C.primaryTint : 'transparent',
                    color: i === selectedIndex ? C.primary : C.textSecondary
                  }}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-md" style={{ backgroundColor: i === selectedIndex ? C.bg : C.surface, color: i === selectedIndex ? C.primary : C.textMuted }}>
                    {item.icon}
                  </div>
                  <span className="text-[14px] font-medium flex-1" style={{ color: i === selectedIndex ? C.primary : C.textPrimary }}>{item.title}</span>
                  {i === selectedIndex && <span className="text-[11px] font-medium" style={{ color: C.primary }}>Enter</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-[14px]" style={{ color: C.textMuted }}>No results found for "{query}"</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t text-[11px] flex items-center justify-between" style={{ borderColor: C.border, color: C.textMuted }}>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: C.border, backgroundColor: C.neutralTint }}>↑</kbd> <kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: C.border, backgroundColor: C.neutralTint }}>↓</kbd> to navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: C.border, backgroundColor: C.neutralTint }}>Enter</kbd> to select</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: C.border, backgroundColor: C.neutralTint }}>Esc</kbd> to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
