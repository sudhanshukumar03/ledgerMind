'use client';

import React from 'react';
import { useAiInvestigation } from '../../hooks/useAiInvestigation';
import { AiAnalysis } from '../../lib/types';
import { C } from '../../lib/tokens';
import { Bot, Loader2, Zap } from 'lucide-react';
import { PlainText } from './PlainText';
import { ToolCallList } from './ToolCallList';

export function AiChatThread({ exceptionId, initialAnalysis }: { exceptionId: string; initialAnalysis?: AiAnalysis }) {
  const { data: analysis, loading, error, investigate } = useAiInvestigation(exceptionId, initialAnalysis);

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      {/* Intro bubble */}
      <div className="flex gap-4 animate-slide-up">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.primary, color: C.bg }}>
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex flex-col gap-1 w-full">
          <div className="text-[11px] font-semibold" style={{ color: C.textSecondary }}>LedgerMind AI</div>
          <div className="px-5 py-4 rounded-2xl rounded-tl-sm border text-[13px] leading-relaxed" style={{ backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }}>
            <p className="mb-4">
              I am ready to help you investigate exception <strong className="font-mono">{exceptionId}</strong>.
            </p>
            <button 
              onClick={investigate} 
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors text-[13px]"
              style={{ backgroundColor: C.primaryTint, color: C.primary }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Investigating…</>
              ) : (
                <><Zap className="w-4 h-4" /> {analysis ? 'Re-investigate with AI' : 'Investigate with AI'}</>
              )}
            </button>
            {error && (
              <div className="mt-3 p-3 rounded bg-red-50 text-red-600 text-[12px] border border-red-100">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading Skeleton Bubble */}
      {loading && (
        <div className="flex gap-4 animate-fade-in">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.primary, color: C.bg }}>
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div className="flex flex-col gap-1 w-full">
            <div className="text-[11px] font-semibold" style={{ color: C.textSecondary }}>LedgerMind AI</div>
            <div className="px-5 py-4 rounded-2xl rounded-tl-sm border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Bubble */}
      {!loading && analysis && (
        <div className="flex gap-4 animate-slide-up">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.primary, color: C.bg }}>
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex flex-col gap-1 w-full">
            <div className="text-[11px] font-semibold" style={{ color: C.textSecondary }}>LedgerMind AI</div>
            <div className="px-5 py-4 rounded-2xl rounded-tl-sm border text-[13px] leading-relaxed space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }}>
              
              <ToolCallList toolCalls={analysis.toolCalls as any} />

              <div>
                <p className="text-[11px] uppercase tracking-wide mb-1 font-semibold" style={{ color: C.textMuted }}>Summary</p>
                <PlainText text={analysis.summary} className="text-[13px]" />
              </div>
              
              <div>
                <p className="text-[11px] uppercase tracking-wide mb-1 font-semibold" style={{ color: C.textMuted }}>Likely Cause</p>
                <PlainText text={analysis.likelyCause} className="text-[13px]" />
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wide mb-1 font-semibold" style={{ color: C.textMuted }}>Recommended Action</p>
                <div className="inline-block px-3 py-1.5 text-[12px] font-semibold border rounded-md" style={{ backgroundColor: C.infoTint, borderColor: `${C.info}40`, color: C.info }}>
                  <PlainText text={analysis.recommendedAction} />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
