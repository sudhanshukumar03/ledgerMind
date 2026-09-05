'use client';

import React, { useState } from 'react';
import { C } from '../../lib/tokens';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ToolCall {
  tool: string;
  args: any;
  result: any;
}

export function ToolCallList({ toolCalls }: { toolCalls?: ToolCall[] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-2 mt-4">
      <p className="text-[11px] uppercase tracking-wide" style={{ color: C.textMuted }}>Tools Used</p>
      <div className="flex flex-col gap-2">
        {toolCalls.map((tc, idx) => (
          <ToolCallItem key={idx} tc={tc} />
        ))}
      </div>
    </div>
  );
}

function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-md overflow-hidden" style={{ borderColor: C.border, backgroundColor: C.surface }}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 transition-colors hover-bg-muted"
        style={{ backgroundColor: C.neutralTint }}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: C.textMuted }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: C.textMuted }} />
          )}
          <span className="text-[12px] font-mono font-semibold" style={{ color: C.textPrimary }}>
            {tc.tool}()
          </span>
        </div>
      </button>
      
      {expanded && (
        <div className="px-3 py-2 border-t text-[11px] font-mono space-y-2" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <div>
            <span className="font-semibold block mb-1" style={{ color: C.textMuted }}>Arguments:</span>
            <pre className="whitespace-pre-wrap break-all" style={{ color: C.textSecondary }}>
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          </div>
          {tc.result && (
            <div className="pt-2 border-t" style={{ borderColor: C.border }}>
              <span className="font-semibold block mb-1" style={{ color: C.textMuted }}>Result:</span>
              <pre className="whitespace-pre-wrap break-all" style={{ color: C.textSecondary }}>
                {JSON.stringify(tc.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
