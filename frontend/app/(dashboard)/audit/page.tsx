'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { auditApi, AuditLog } from '../../../lib/api-client';
import { Header } from '../../../components/layout/Header';
import { C } from '../../../lib/tokens';
import { Loader2, RefreshCw, ChevronRight, ChevronDown, User as UserIcon, Cpu, Server } from 'lucide-react';

const ACTOR_STYLE: Record<AuditLog['actorType'], { bg: string; fg: string; icon: React.ReactNode; label: string }> = {
  USER: { bg: C.infoTint, fg: C.info, icon: <UserIcon className="w-3 h-3" />, label: 'User' },
  SYSTEM: { bg: C.neutralTint, fg: C.textSecondary, icon: <Server className="w-3 h-3" />, label: 'System' },
  AI: { bg: C.primaryTint, fg: C.primary, icon: <Cpu className="w-3 h-3" />, label: 'AI' },
};

const titleCase = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function StateBlock({ label, value, tint }: { label: string; value: unknown; tint: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: C.textMuted }}>
        {label}
      </div>
      <pre
        className="text-[11px] font-mono rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words"
        style={{ backgroundColor: tint, color: C.textPrimary }}
      >
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

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
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface }}>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th className="w-8" />
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.textSecondary }}>Time</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.textSecondary }}>Actor</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.textSecondary }}>Action</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.textSecondary }}>Entity</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.textSecondary }}>Reason</th>
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
                      >
                        <td className="pl-3" style={{ color: C.textMuted }}>
                          {hasDetail && (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.textSecondary }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                            style={{ backgroundColor: actor.bg, color: actor.fg }}
                          >
                            {actor.icon}
                            {log.user?.name ?? actor.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: C.textPrimary }}>
                          {titleCase(log.action)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.textSecondary }}>
                          <span style={{ color: C.textPrimary }}>{titleCase(log.entityType)}</span>
                          {log.entityId && (
                            <span className="ml-1.5 font-mono text-[11px]" style={{ color: C.textMuted }}>
                              {log.entityId.slice(0, 8)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[280px] truncate" style={{ color: C.textSecondary }}>
                          {log.reason ?? '—'}
                        </td>
                      </tr>
                      {isOpen && hasDetail && (
                        <tr style={{ backgroundColor: C.bg }}>
                          <td />
                          <td colSpan={5} className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <StateBlock label="Before" value={log.beforeState} tint={C.criticalTint} />
                              <StateBlock label="After" value={log.afterState} tint={C.successTint} />
                            </div>
                            {log.correlationId && (
                              <div className="mt-3 text-[11px]" style={{ color: C.textMuted }}>
                                Correlation: <span className="font-mono">{log.correlationId}</span>
                              </div>
                            )}
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
    </div>
  );
}
