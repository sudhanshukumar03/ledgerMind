'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Exception } from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { Bot, Loader2, X, Zap } from 'lucide-react';
import { useAiInvestigation } from '../../hooks/useAiInvestigation';
import { PlainText } from '../ai/PlainText';
import { ToolCallList } from '../ai/ToolCallList';
import { StatusBadge } from '../ui/StatusBadge';
import { Amount } from '../ui/Amount';

interface QuickInvestigatePopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  exception: Exception | null;
  onClose: () => void;
}

export function QuickInvestigatePopover({ open, anchorEl, exception, onClose }: QuickInvestigatePopoverProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  // useAiInvestigation provides idempotent investigation, 15s timeout, and abort controller
  const { data: analysis, loading, error, investigate, reset } = useAiInvestigation(exception?.id || '', exception?.aiAnalyses?.[0]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !anchorEl) return;
    
    // Reset state on open if exception changed
    reset();

    const updatePosition = () => {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      
      // Attempt to center below the anchor, but keep within viewport bounds
      let top = rect.bottom + 8;
      let left = rect.right - 360; // Align to the right edge of the anchor (e.g. action button)
      
      if (left < 16) left = 16;
      if (top + 400 > window.innerHeight) {
        top = rect.top - 8 - 400; // Position above if no space below
        if (top < 16) top = 16; // Don't go off top
      }

      setPosition({ top, left });
    };
    
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, anchorEl, reset]);

  // Handle Escape key or click outside
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (anchorEl?.contains(e.target as Node)) return;
      
      const popover = document.getElementById('quick-investigate-popover');
      if (popover && !popover.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !exception || !mounted) return null;

  const content = (
    <div 
      id="quick-investigate-popover"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Investigate AI"
      className="fixed z-[100] w-[360px] rounded-lg shadow-2xl border flex flex-col animate-fade-in"
      style={{
        backgroundColor: C.surface,
        top: position.top, left: position.left, borderColor: C.border, maxHeight: 'calc(100vh - 32px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b rounded-t-lg shrink-0" style={{ borderColor: C.border, backgroundColor: C.neutralTint }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center bg-teal-100 text-teal-700" style={{ backgroundColor: C.primaryTint, color: C.primary }}>
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: C.textPrimary }}>Investigate</span>
          <span className="text-[12px] font-mono ml-1" style={{ color: C.textMuted }}>{exception.exceptionId}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded transition-colors hover-bg-muted" style={{ color: C.textMuted }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Layer 1: Deterministic Facts (Instant) */}
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-1 font-semibold text-[10px]">Severity</div>
            <StatusBadge severity={exception.severity} />
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-1 font-semibold text-[10px]">Status</div>
            <StatusBadge status={exception.status} />
          </div>
          <div className="col-span-2">
            <div className="text-gray-500 uppercase tracking-wide mb-1 font-semibold text-[10px]">Exposure</div>
            <div className="font-bold text-[14px] text-gray-900"><Amount value={exception.financialImpact} /></div>
          </div>
        </div>

        {/* Action Button */}
        {!analysis && !loading && (
          <button 
            onClick={investigate}
            className="w-full py-2.5 rounded-md text-[13px] font-medium transition-colors border shadow-sm flex justify-center items-center gap-2"
            style={{ backgroundColor: C.primary, color: C.bg, borderColor: C.primary }}
          >
            Investigate with AI
          </button>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-[12px] border border-red-100">
            {error}
            <button onClick={investigate} className="block mt-2 font-medium underline">Retry</button>
          </div>
        )}

        {/* Layer 2: Loading Skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse border-t pt-4" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-[12px] font-medium text-gray-500">AI is investigating...</span>
            </div>
            <div className="h-3 rounded w-full" style={{ backgroundColor: C.neutralTint }}></div>
            <div className="h-3 rounded w-5/6" style={{ backgroundColor: C.neutralTint }}></div>
            <div className="h-3 rounded w-4/6" style={{ backgroundColor: C.neutralTint }}></div>
          </div>
        )}

        {/* Layer 3: AI Narrative */}
        {!loading && analysis && (
          <div className="space-y-4 border-t pt-4 animate-slide-up" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-4 h-4" style={{ color: C.primary }} />
              <span className="text-[12px] font-semibold text-gray-900">AI Analysis</span>
            </div>
            
            <ToolCallList toolCalls={analysis.toolCalls as any} />

            <div>
              <p className="text-[11px] uppercase tracking-wide mb-1 font-semibold" style={{ color: C.textMuted }}>Summary</p>
              <PlainText text={analysis.summary} className="text-[12px] text-gray-800 leading-relaxed" />
            </div>
            
            <div>
              <p className="text-[11px] uppercase tracking-wide mb-1 font-semibold" style={{ color: C.textMuted }}>Likely Cause</p>
              <PlainText text={analysis.likelyCause} className="text-[12px] text-gray-800" />
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide mb-1 font-semibold" style={{ color: C.textMuted }}>Recommended Action</p>
              <div className="inline-block px-2 py-1.5 text-[12px] font-semibold border rounded text-blue-700 bg-blue-50 border-blue-100">
                <PlainText text={analysis.recommendedAction} />
              </div>
            </div>
            
            <button 
              onClick={investigate}
              className="w-full mt-2 py-2 rounded text-[12px] font-medium border transition-colors hover-bg-muted"
              style={{ borderColor: C.border, color: C.textSecondary, backgroundColor: C.neutralTint }}
            >
              Re-investigate
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
