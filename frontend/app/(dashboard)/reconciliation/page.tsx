'use client';

import React, { useEffect, useState } from 'react';
import { reconciliationApi, ReconciliationRun } from '../../../lib/api-client';
import { Header } from '../../../components/layout/Header';
import { StatCard } from '../../../components/ui/StatCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { C } from '../../../lib/tokens';
import { Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import useSWR from 'swr';

export default function ReconciliationPage() {
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const { data: runs = [], isLoading: loading, mutate } = useSWR(
    'reconciliation-runs',
    () => reconciliationApi.listRuns()
            .then(r => Array.isArray(r.data) ? r.data : (r.data as any).data ?? []),
    {
      fallbackData: [],
      refreshInterval: (data) => (data?.[0]?.status === 'IN_PROGRESS' ? 2000 : 0)
    }
  );

  const triggerRun = async () => {
    setRunning(true);
    setMsg(null);
    try {
      await reconciliationApi.triggerRun();
      await mutate();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.message ?? 'Run failed' });
    } finally {
      setRunning(false);
    }
  };

  const latest = runs[0];
  
  useEffect(() => {
    // If the latest run just finished successfully, show a message
    if (latest && latest.status === 'COMPLETED' && !loading) {
      const isRecent = (Date.now() - new Date(latest.completedAt!).getTime()) < 5000;
      if (isRecent) {
        setMsg({ type: 'success', text: 'Reconciliation completed — check the Exceptions page for new findings.' });
      }
    }
    // If it failed recently
    if (latest && latest.status === 'FAILED' && !loading) {
      const isRecent = (Date.now() - new Date(latest.completedAt || latest.startedAt).getTime()) < 5000;
      if (isRecent) {
        setMsg({ type: 'error', text: 'Reconciliation run failed. Please check the logs.' });
      }
    }
  }, [latest, loading]);

  return (
    <div className="flex flex-col h-full bg-bg">
      <Header 
        title="Reconciliation" 
        action={
          <button onClick={triggerRun} disabled={running || loading} className="btn-primary">
            {running ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running ? 'Running...' : 'Run Now'}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-8 flex flex-col gap-6 max-w-[1200px] w-full mx-auto">
        
        {msg && (
          <div 
            className="flex items-center gap-3 px-4 py-3 rounded-lg border text-[13px] font-medium"
            style={{ 
              backgroundColor: msg.type === 'success' ? C.successTint : C.criticalTint,
              borderColor: msg.type === 'success' ? `${C.success}40` : `${C.critical}40`,
              color: msg.type === 'success' ? C.success : C.critical
            }}
          >
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="flex-1">{msg.text}</span>
            <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
          </div>
        )}

        {latest && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              label="Match Rate" 
              value={latest.totalRecords > 0 ? `${Math.round((latest.matchedCount / latest.totalRecords) * 100)}%` : '—'} 
              isPositive={latest.totalRecords > 0 && (latest.matchedCount / latest.totalRecords) > 0.9}
            />
            <StatCard label="Matched Records" value={latest.matchedCount ?? 0} />
            <StatCard label="Exceptions Found" value={latest.exceptionCount ?? 0} isPositive={false} />
            <StatCard label="Total Records" value={latest.totalRecords ?? 0} />
          </div>
        )}

        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
            <h2 className="text-[14px] font-semibold" style={{ color: C.textPrimary }}>Run History</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                <tr>
                  {['Status', 'Started', 'Duration', 'Records', 'Match Rate', 'Exceptions'].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap" style={{ color: C.textMuted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: C.border }}>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: C.primary }}/></td></tr>
                ) : runs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-[13px]" style={{ color: C.textMuted }}>No runs yet — click "Run Now"</td></tr>
                ) : runs.map(run => {
                  const started = new Date(run.startedAt);
                  const ended = run.completedAt ? new Date(run.completedAt) : null;
                  const dur = ended ? Math.round((ended.getTime() - started.getTime()) / 1000) : null;
                  
                  const pct = run.totalRecords > 0 ? (run.matchedCount / run.totalRecords) * 100 : 0;
                  
                  return (
                    <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: C.textSecondary }}>{started.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="px-4 py-3 text-[13px] font-mono" style={{ color: C.textSecondary }}>{dur != null ? `${dur}s` : '—'}</td>
                      <td className="px-4 py-3 text-[13px] font-mono" style={{ color: C.textSecondary }}>{run.totalRecords ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 w-32">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.neutralTint }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500" 
                              style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? C.success : pct >= 70 ? C.warning : run.status === 'FAILED' ? C.critical : C.critical }} 
                            />
                          </div>
                          <span className="text-[12px] font-mono" style={{ color: C.textSecondary }}>{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {run.status === 'FAILED' ? (
                          <span className="text-[13px] font-semibold text-red-500">Failed</span>
                        ) : (
                          <span className="text-[13px] font-semibold" style={{ color: (run.exceptionCount ?? 0) > 0 ? C.critical : C.success }}>
                            {run.exceptionCount ?? 0}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
