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

const formatPayload = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(formatPayload);
  if (obj && typeof obj === 'object') {
    const res: any = {};
    for (const key in obj) {
      if (key === 'lastSeenAt' && typeof obj.occurrenceCount === 'number') {
        res[key] = `${obj.occurrenceCount}×`;
      } else {
        res[key] = formatPayload(obj[key]);
      }
    }
    return res;
  }
  return obj;
};

function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <details className="border rounded-md overflow-hidden group" style={{ borderColor: C.border, backgroundColor: C.surface }}>
      <summary 
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-slate-50 list-none [&::-webkit-details-marker]:hidden"
        style={{ backgroundColor: C.neutralTint }}
      >
        <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" style={{ color: C.textMuted }} />
        <span className="text-[12px] font-mono font-semibold" style={{ color: C.textPrimary }}>
          {tc.tool}()
        </span>
      </summary>
      
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
            <pre className="whitespace-pre-wrap break-all overflow-y-auto max-h-64" style={{ color: C.textSecondary }}>
              {JSON.stringify(formatPayload(tc.result), null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
