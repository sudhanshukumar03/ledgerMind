'use client';
import React, { useState } from 'react';
import { C } from '../../lib/tokens';
import { ChevronRight } from 'lucide-react';
import { humanizeKey, humanizeLabel, formatValue, toRecord, isIdentifier, isMoney } from '../../lib/humanize';

interface ToolCall { tool: string; args: any; result: any; }

export function ToolCallList({ toolCalls }: { toolCalls?: ToolCall[] }) {
  if (!toolCalls || toolCalls.length === 0) return null;
  return (
    <div className="space-y-2 mt-4">
      <p className="text-[11px] uppercase tracking-wide" style={{ color: C.textMuted }}>
        Tools Used · {toolCalls.length}
      </p>
      <div className="flex flex-col gap-2">
        {toolCalls.map((tc, idx) => (<ToolCallItem key={idx} tc={tc} />))}
      </div>
    </div>
  );
}

/** Count label for a result ("3 results", "1 record", "No data"). */
function resultSummary(result: unknown): string {
  if (result === null || result === undefined || result === '') return 'No data';
  if (Array.isArray(result)) return `${result.length} result${result.length !== 1 ? 's' : ''}`;
  if (typeof result === 'object') return '1 record';
  return 'Value';
}

/** A compact scalar value, in monospace when it is an identifier. */
function Scalar({ k, value }: { k: string; value: unknown }) {
  const mono = isIdentifier(k, value);
  return (
    <span
      className={mono ? 'font-mono text-[11px] break-all' : 'text-[12px]'}
      style={{ color: C.textPrimary, fontWeight: isMoney(k, value) ? 600 : 400 }}
    >
      {formatValue(k, value)}
    </span>
  );
}

/** Arguments / single-object result → aligned label·value rows. */
function KeyValueRows({ record }: { record: Record<string, unknown> }) {
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return <span className="text-[11px]" style={{ color: C.textMuted }}>None</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 min-w-0">
          <span className="shrink-0 text-[11px]" style={{ color: C.textMuted }}>{humanizeLabel(k)}</span>
          <span className="text-right min-w-0 break-words">
            {toRecord(v) || Array.isArray(v)
              ? <span className="text-[11px]" style={{ color: C.textSecondary }}>{formatValue(k, v)}</span>
              : <Scalar k={k} value={v} />}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Keys of the first row first (stable order), then any extra keys later rows add. */
function unionKeys(rows: Record<string, unknown>[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) { keys.push(k); seen.add(k); }
    }
  }
  return keys;
}

/** Array of objects → a tidy table (the common "list_*" tool result shape). */
function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = unionKeys(rows);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>
            {keys.map((k) => (
              <th key={k} className="text-left font-semibold pb-1.5 pr-4 whitespace-nowrap">{humanizeLabel(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              {keys.map((k) => (
                <td key={k} className="py-1.5 pr-4 align-top whitespace-nowrap">
                  {row[k] === undefined
                    ? <span className="text-[12px]" style={{ color: C.textMuted }}>—</span>
                    : <Scalar k={k} value={row[k]} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render any tool result readably: table for object lists, rows for a record, text otherwise. */
function ReadableResult({ result }: { result: unknown }) {
  if (result === null || result === undefined || result === '') {
    return <span className="text-[11px]" style={{ color: C.textMuted }}>No data returned.</span>;
  }
  if (Array.isArray(result)) {
    const objRows = result.filter((r) => toRecord(r)) as Record<string, unknown>[];
    if (objRows.length === result.length && objRows.length > 0) return <ResultTable rows={objRows} />;
    // Array of scalars (or mixed) → comma-joined list.
    return <span className="text-[12px]" style={{ color: C.textPrimary }}>{formatValue('', result)}</span>;
  }
  const rec = toRecord(result);
  if (rec) return <KeyValueRows record={rec} />;
  return <Scalar k="" value={result} />;
}

function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const argsRec = toRecord(tc.args);
  const hasArgs = argsRec && Object.keys(argsRec).length > 0;

  return (
    <div className="border rounded-md overflow-hidden" style={{ borderColor: C.border, backgroundColor: C.surface }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-left hover-bg-muted"
        style={{ backgroundColor: C.neutralTint }}
      >
        <ChevronRight
          className="w-3.5 h-3.5 shrink-0 transition-transform"
          style={{ color: C.textMuted, transform: expanded ? 'rotate(90deg)' : undefined }}
        />
        <span className="text-[12px] font-mono font-semibold" style={{ color: C.textPrimary }}>{tc.tool}</span>
        <span className="ml-auto text-[11px]" style={{ color: C.textMuted }}>{resultSummary(tc.result)}</span>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 border-t space-y-3" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: C.textMuted }}>
              Query
            </span>
            {hasArgs
              ? <KeyValueRows record={argsRec!} />
              : <span className="text-[11px]" style={{ color: C.textMuted }}>No parameters</span>}
          </div>
          <div className="pt-2.5 border-t" style={{ borderColor: C.border }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: C.textMuted }}>
              Result · {resultSummary(tc.result)}
            </span>
            <ReadableResult result={tc.result} />
          </div>
        </div>
      )}
    </div>
  );
}
