'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Keyboard } from 'lucide-react';
import { C } from '../../lib/tokens';

export function KeyboardNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let keyBuffer = '';
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Returns true if keyboard focus is inside a text input or a modal dialog
    const isCaptured = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        t.isContentEditable
      ) return true;
      // Block if any modal/dialog is open
      if (document.querySelector('[role="dialog"], [data-modal]')) return true;
      return false;
    };

    const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCaptured(e)) return;

      if (e.key === '?') {
        setShowHelp(true);
        return;
      }

      if (e.key === 'Escape') {
        setShowHelp(false);
        return;
      }

      keyBuffer += e.key;

      if (keyBuffer === 'gd') router.push('/');
      if (keyBuffer === 'ge') router.push('/exceptions');
      if (keyBuffer === 'gr') router.push('/reconciliation');  // typo fix
      if (keyBuffer === 'ga') router.push('/actions');

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        keyBuffer = '';
      }, 800); // 800ms buffer per spec
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <>
      {children}
      {showHelp && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-slide-up border" style={{ borderColor: C.border }}>
            <div className="px-5 py-4 border-b flex items-center gap-3 bg-surface" style={{ borderColor: C.border }}>
              <Keyboard className="w-5 h-5 text-gray-500" />
              <h2 className="text-[14px] font-bold" style={{ color: C.textPrimary }}>Keyboard Shortcuts</h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { keys: ['g', 'd'], label: 'Go to Dashboard' },
                { keys: ['g', 'e'], label: 'Go to Exceptions' },
                { keys: ['g', 'r'], label: 'Go to Reconciliations' },
                { keys: ['g', 'a'], label: 'Go to Actions' },
                { keys: ['?'], label: 'Show this help modal' },
              ].map(({ keys, label }, i) => (
                <div key={i} className="flex justify-between items-center text-[13px]">
                  <span style={{ color: C.textSecondary }}>{label}</span>
                  <div className="flex gap-1">
                    {keys.map(k => (
                      <kbd key={k} className="px-2 py-1 rounded bg-surface border font-mono text-xs" style={{ borderColor: C.border, color: C.textPrimary }}>
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t text-center" style={{ borderColor: C.border, backgroundColor: C.neutralTint }}>
              <button onClick={() => setShowHelp(false)} className="text-[12px] font-medium" style={{ color: C.primary }}>
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
