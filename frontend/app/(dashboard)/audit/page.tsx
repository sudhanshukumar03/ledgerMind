'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { auditApi, AuditLog } from '../../../lib/api-client';
import { Header } from '../../../components/layout/Header';
import { C } from '../../../lib/tokens';
import { Loader2, RefreshCw, ChevronRight, ChevronDown, User as UserIcon, Cpu, Server, FilePlus2, FilePen, FileX2, X, Maximize2 } from 'lucide-react';
import { titleCase, humanizeKey, formatValue, toRecord, isIdentifier } from '../../../lib/humanize';

const ACTOR_STYLE: Record<AuditLog['actorType'], { bg: string; fg: string; icon: React.ReactNode; label: string }> = {
  USER: { bg: C.infoTint, fg: C.info, icon: <UserIcon className="w-3 h-3" />, label: 'User' },
  SYSTEM: { bg: C.neutralTint, fg: C.textSecondary, icon: <Server className="w-3 h-3" />, label: 'System' },
  AI: { bg: C.primaryTint, fg: C.primary, icon: <Cpu className="w-3 h-3" />, label: 'AI' },
};

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Keys of after first (stable), then any keys that only exist in before. */
function unionKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const k of Object.keys(after ?? {})) { keys.push(k); seen.add(k); }
  for (const k of Object.keys(before ?? {})) { if (!seen.has(k)) keys.push(k); }
  return keys;
}

type Tone = 'before' | 'after' | 'plain';
const TONE_FG: Record<Tone, string> = { before: C.critical, after: C.success, plain: C.textPrimary };
const TONE_BG: Record<Tone, string> = { before: C.criticalTint, after: C.successTint, plain: 'transparent' };

// Group a record's fields into readable sections so the detail view reads like a
// managed audit record — business details first, then timeline, then the technical
// identifiers — instead of one flat wall of keys.
type Section = 'details' | 'timeline' | 'refs';
const SECTION_LABEL: Record<Section, string> = { details: 'Details', timeline: 'Timeline', refs: 'References' };
const SECTION_ORDER: Section[] = ['details', 'timeline', 'refs'];

const isTimestamp = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);

function sectionOf(key: string, before: unknown, after: unknown): Section {
  if (key === 'id' || /Id$/.test(key) || /key$/i.test(key)) return 'refs';
  if (/At$/.test(key) || isTimestamp(before) || isTimestamp(after)) return 'timeline';
  return 'details';
}

/** A single scalar value as a tinted chip; long identifiers render monospace + truncated. */
function Scalar({ k, value, tone }: { k: string; value: unknown; tone: Tone }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-[12px]" style={{ color: C.textMuted }}>—</span>;
  }
  const mono = isIdentifier(k, value);
  return (
    <span className="inline-block px-1.5 py-0.5 rounded max-w-full" style={{ backgroundColor: TONE_BG[tone] }}>
      <span
        className={mono ? 'font-mono text-[11px] break-all' : 'text-[12px] break-words'}
        style={{ color: TONE_FG[tone], fontWeight: 500 }}
        title={mono ? String(value) : undefined}
      >
        {formatValue(k, value)}
      </span>
    </span>
  );
}

/**
 * A nested object (parameters, a policy decision, a related-entity snapshot…).
 * Small objects stay open; larger ones collapse behind a toggle so a 20-field
 * relation never floods the row. `accent` tints the left rule when it changed.
 */
function NestedPanel({ value, accent, note, cols = 2 }: { value: Record<string, unknown>; accent?: string; note?: string; cols?: 1 | 2 }) {
  const entries = Object.entries(value);
  const [open, setOpen] = useState(entries.length <= 4);
  return (
    <div className="rounded-md border overflow-hidden" style={{ borderColor: C.border, borderLeft: accent ? `2px solid ${accent}` : undefined, backgroundColor: C.bg }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium hover-bg-muted"
        style={{ color: C.textMuted }}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {entries.length} field{entries.length !== 1 ? 's' : ''}{note ? ` · ${note}` : ''}
      </button>
      {open && (
        <dl className={`grid grid-cols-1 ${cols === 2 ? 'sm:grid-cols-2' : ''} gap-x-10 gap-y-0.5 px-3 pb-2.5 pt-1`}>
          {entries.map(([sk, sv]) => (
            <div key={sk} className="flex items-baseline gap-2 min-w-0 py-0.5">
              <dt className="shrink-0 text-[11px]" style={{ color: C.textMuted }}>{humanizeKey(sk)}</dt>
              <dd className={`min-w-0 text-[11px] ${isIdentifier(sk, sv) ? 'font-mono break-all' : 'break-words'}`} style={{ color: C.textSecondary, fontWeight: 500 }}>
                {sv === null || sv === undefined || sv === '' ? '—' : formatValue(sk, sv)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Shared grid tracks so the field label, Before and After columns line up across every row. */
const GRID_DIFF = '184px minmax(0,1fr) minmax(0,1fr)';
const GRID_SNAP = '184px minmax(0,1fr)';

/** Placeholder for a side of a diff where the object is absent (added or removed wholesale). */
function EmptyCell({ label }: { label: string }) {
  return (
    <span className="inline-block text-[11px] italic px-1.5 py-0.5" style={{ color: C.textMuted }}>
      {label}
    </span>
  );
}

/**
 * One field, laid out on the shared grid so values align into real columns. A
 * snapshot shows a single Value column; a diff shows Before and After side by
 * side (unchanged rows let the value span both). An always-present status marker
 * — filled when changed, a hollow ring otherwise — keeps the label column steady.
 * Object-valued fields render as (collapsible) panels within their column cell.
 */
function FieldLine({ fieldKey, before, after, mode }: { fieldKey: string; before: unknown; after: unknown; mode: 'snapshot' | 'diff' }) {
  const changed = mode === 'diff' && !valuesEqual(before, after);
  const beforeObj = toRecord(before);
  const afterObj = toRecord(after);
  const hasObject = !!(beforeObj || afterObj);

  const labelCell = (
    <div className="flex items-start gap-2 min-w-0 pr-5">
      <span
        className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
        style={changed ? { backgroundColor: C.warning } : { boxShadow: `inset 0 0 0 1px ${C.border}` }}
      />
      <span className="text-[12px] leading-6 break-words" style={{ color: changed ? C.textPrimary : C.textSecondary, fontWeight: changed ? 600 : 500 }}>
        {humanizeKey(fieldKey)}
      </span>
    </div>
  );

  const cellCls = 'min-w-0 pt-0.5 pl-5';
  const cellStyle = { borderLeft: `1px solid ${C.border}` };

  return (
    <div className="grid py-2.5 items-stretch" style={{ gridTemplateColumns: mode === 'diff' ? GRID_DIFF : GRID_SNAP, borderBottom: `1px solid ${C.border}` }}>
      {labelCell}
      {mode === 'snapshot' ? (
        <div className={cellCls} style={cellStyle}>
          {hasObject ? <NestedPanel value={(afterObj ?? beforeObj)!} /> : <Scalar k={fieldKey} value={after !== undefined ? after : before} tone="plain" />}
        </div>
      ) : hasObject ? (
        <>
          <div className={cellCls} style={cellStyle}>{beforeObj ? <NestedPanel value={beforeObj} accent={changed ? C.critical : undefined} cols={1} /> : <EmptyCell label="Not present" />}</div>
          <div className={cellCls} style={cellStyle}>{afterObj ? <NestedPanel value={afterObj} accent={changed ? C.success : undefined} cols={1} /> : <EmptyCell label="Removed" />}</div>
        </>
      ) : changed ? (
        <>
          <div className={cellCls} style={cellStyle}><Scalar k={fieldKey} value={before} tone="before" /></div>
          <div className={cellCls} style={cellStyle}><Scalar k={fieldKey} value={after} tone="after" /></div>
        </>
      ) : (
        <div className={cellCls} style={{ ...cellStyle, gridColumn: 'span 2' }}><Scalar k={fieldKey} value={after} tone="plain" /></div>
      )}
    </div>
  );
}

/**
 * Audit state renderer. Classifies the change (created / updated / removed) and
 * lays the record out as line-segmented, sectioned field rows: a clean snapshot
 * for create/remove, and a focused Before → After diff for updates (unchanged
 * fields collapse behind a toggle to keep the signal high).
 */
function StateDiff({ before, after }: { before: unknown; after: unknown }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const beforeRec = toRecord(before);
  const afterRec = toRecord(after);

  if (!beforeRec && !afterRec) {
    return <span className="text-[12px]" style={{ color: C.textMuted }}>No state snapshot recorded.</span>;
  }

  const kind: 'created' | 'removed' | 'updated' = !beforeRec ? 'created' : !afterRec ? 'removed' : 'updated';
  const META = {
    created: { label: 'Record created', fg: C.success, bg: C.successTint, icon: <FilePlus2 className="w-3.5 h-3.5" /> },
    removed: { label: 'Record removed', fg: C.critical, bg: C.criticalTint, icon: <FileX2 className="w-3.5 h-3.5" /> },
    updated: { label: 'Record updated', fg: C.warning, bg: `${C.warning}22`, icon: <FilePen className="w-3.5 h-3.5" /> },
  }[kind];

  const mode: 'snapshot' | 'diff' = kind === 'updated' ? 'diff' : 'snapshot';
  const keys = unionKeys(beforeRec, afterRec);
  const changedKeys = kind === 'updated' ? keys.filter((k) => !valuesEqual(beforeRec![k], afterRec![k])) : keys;
  const unchangedCount = kind === 'updated' ? keys.length - changedKeys.length : 0;
  const visibleKeys = kind === 'updated' && !showUnchanged ? changedKeys : keys;
  const bySection = (sec: Section) => visibleKeys.filter((k) => sectionOf(k, beforeRec?.[k], afterRec?.[k]) === sec);
  const note = kind === 'updated'
    ? `${changedKeys.length} field${changedKeys.length !== 1 ? 's' : ''} changed`
    : `${keys.length} field${keys.length !== 1 ? 's' : ''}`;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, backgroundColor: C.surface }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: META.bg, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: META.fg }}>{META.icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: META.fg }}>{META.label}</span>
        <span className="text-[11px]" style={{ color: C.textMuted }}>· {note}</span>
      </div>
      {kind === 'updated' && changedKeys.length === 0 ? (
        <div className="px-4 py-4 text-[12px]" style={{ color: C.textMuted }}>No field values changed.</div>
      ) : (
        <div className="px-4">
          <div className="grid py-2.5 items-stretch" style={{ gridTemplateColumns: mode === 'diff' ? GRID_DIFF : GRID_SNAP, borderBottom: `1px solid ${C.border}` }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center" style={{ color: C.textMuted }}>Field</span>
            {mode === 'diff' ? (
              <>
                <span className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.critical, borderLeft: `1px solid ${C.border}` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: C.critical }} />Before
                </span>
                <span className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.success, borderLeft: `1px solid ${C.border}` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: C.success }} />After
                </span>
              </>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider pl-5" style={{ color: C.textMuted, borderLeft: `1px solid ${C.border}` }}>Value</span>
            )}
          </div>
          {SECTION_ORDER.map((sec) => {
            const sKeys = bySection(sec);
            if (sKeys.length === 0) return null;
            return (
              <div key={sec}>
                <div className="text-[10px] font-semibold uppercase tracking-wider pt-4 pb-1" style={{ color: C.textMuted, opacity: 0.7 }}>
                  {SECTION_LABEL[sec]}
                </div>
                {sKeys.map((k) => (
                  <FieldLine key={k} fieldKey={k} before={beforeRec?.[k]} after={afterRec?.[k]} mode={mode} />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {unchangedCount > 0 && (
        <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => setShowUnchanged((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium hover:underline"
            style={{ color: C.textMuted }}
          >
            {showUnchanged ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {showUnchanged ? 'Hide' : 'Show'} {unchangedCount} unchanged field{unchangedCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The body of one audit record: an optional context strip (entity / action /
 * actor / when / reason), the before→after state, and any correlation id. Shared
 * by the inline same-page expansion and the full-screen overlay so both stay in
 * sync. The context strip is redundant with the table row, so inline hides it.
 */
function RecordDetail({ log, showHeader }: { log: AuditLog; showHeader?: boolean }) {
  const actor = ACTOR_STYLE[log.actorType];
  return (
    <div className="flex flex-col gap-4">
      {showHeader && (
        <div className="rounded-lg border flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>Entity</span>
            <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: C.textPrimary }}>
              {titleCase(log.entityType)}
              {log.entityId && <span className="font-mono text-[11px]" style={{ color: C.textMuted }} title={log.entityId}>{log.entityId.slice(0, 8)}</span>}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>Action</span>
            <span className="text-[12px] font-medium" style={{ color: C.textPrimary }}>{titleCase(log.action)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>Actor</span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: actor.fg }}>{actor.icon}{log.user?.name ?? actor.label}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>When</span>
            <span className="text-[12px]" style={{ color: C.textSecondary }}>{new Date(log.createdAt).toLocaleString('en-IN')}</span>
          </div>
          {log.reason && (
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>Reason</span>
              <span className="text-[12px]" style={{ color: C.textSecondary }}>{log.reason}</span>
            </div>
          )}
        </div>
      )}
      <StateDiff before={log.beforeState} after={log.afterState} />
      {log.correlationId && (
        <div className="text-[11px]" style={{ color: C.textMuted }}>
          Correlation: <span className="font-mono">{log.correlationId}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen detail view for one audit record. Opens from the inline expansion's
 * "View full screen" button and closes on Esc or the Close button, returning to
 * the same-page expanded row. Body scrolls independently; the top bar stays pinned.
 */
function DetailOverlay({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const actor = ACTOR_STYLE[log.actorType];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-in fade-in duration-150" style={{ backgroundColor: C.bg }} role="dialog" aria-modal="true" aria-label={`${titleCase(log.action)} audit detail`}>
      <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0" style={{ backgroundColor: actor.bg, color: actor.fg }}>
            {actor.icon}{log.user?.name ?? actor.label}
          </span>
          <h2 className="text-[15px] font-semibold truncate" style={{ color: C.textPrimary }}>{titleCase(log.action)}</h2>
          <span className="text-[12px] truncate" style={{ color: C.textMuted }}>
            {titleCase(log.entityType)}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium hover-bg-muted shrink-0"
          style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}
          aria-label="Close detail"
        >
          <X className="w-4 h-4" /> Close
          <kbd className="ml-1 text-[10px] px-1 py-0.5 rounded font-sans" style={{ backgroundColor: C.neutralTint, color: C.textMuted }}>Esc</kbd>
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <RecordDetail log={log} showHeader />
        </div>
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    auditApi
      .list({ limit: 100 })
      .then((r) => setLogs(r.data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fullLog = logs.find((l) => l.id === fullscreen) ?? null;

  const refreshBtn = (
    <button
      onClick={load}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium hover-bg-muted"
      style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  );
  return (
    <div>
      <Header title="Audit Trail" action={refreshBtn} />

      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
              <tr>
                <th className="w-8" />
                {['Time', 'Actor', 'Action', 'Entity', 'Reason'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap"
                    style={{ color: C.textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: C.textMuted }} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-[13px]" style={{ color: C.textMuted }}>
                    No audit records yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actor = ACTOR_STYLE[log.actorType];
                  const isOpen = expanded === log.id;
                  const hasDetail = log.beforeState != null || log.afterState != null;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`table-row-hover ${hasDetail ? 'cursor-pointer' : ''}`}
                        style={{ borderBottom: `1px solid ${C.border}` }}
                        onClick={() => hasDetail && setExpanded(isOpen ? null : log.id)}
                        role={hasDetail ? 'button' : undefined}
                        tabIndex={hasDetail ? 0 : undefined}
                        aria-expanded={hasDetail ? isOpen : undefined}
                        aria-label={hasDetail ? `${titleCase(log.action)} — ${isOpen ? 'collapse' : 'open'} state details` : undefined}
                        onKeyDown={(e) => {
                          if (hasDetail && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setExpanded(isOpen ? null : log.id);
                          }
                        }}
                      >
                        <td className="pl-3" style={{ color: C.textMuted }}>
                          {hasDetail && (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: C.textSecondary }}>
                          {new Date(log.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                            style={{ backgroundColor: actor.bg, color: actor.fg }}
                          >
                            {actor.icon}
                            {log.user?.name ?? actor.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium" style={{ color: C.textPrimary }}>
                          {titleCase(log.action)}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: C.textPrimary }}>
                          {titleCase(log.entityType)}
                        </td>
                        <td className="px-4 py-3 text-[13px] max-w-[280px] truncate" style={{ color: C.textSecondary }}>
                          {log.reason ?? '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td colSpan={6} className="px-4 pb-5 pt-1" style={{ backgroundColor: C.bg }}>
                            <div className="flex items-center justify-end pb-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); setFullscreen(log.id); }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium hover-bg-muted"
                                style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}
                                aria-label="View this record full screen"
                              >
                                <Maximize2 className="w-3.5 h-3.5" /> View full screen
                              </button>
                            </div>
                            <RecordDetail log={log} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {fullLog && <DetailOverlay log={fullLog} onClose={() => setFullscreen(null)} />}
    </div>
  );
}
