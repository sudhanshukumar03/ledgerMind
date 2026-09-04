'use client';

import React, { useEffect, useState } from 'react';
import { dashboardApi, exceptionsApi, reconciliationApi, DashboardStats, Exception, ReconciliationRun } from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { Header } from '../../components/layout/Header';
import { StatCard } from '../../components/ui/StatCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Amount } from '../../components/ui/Amount';
import { Play } from 'lucide-react';
import Link from 'next/link';
import { formatPaiseCompact } from '../../lib/utils';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

import useSWR from 'swr';

export default function DashboardPage() {
  const [running, setRunning] = useState(false);

  const { data, isLoading: loading, mutate } = useSWR('dashboard-data', async () => {
    const [s, e, r] = await Promise.all([
      dashboardApi.getStats(),
      exceptionsApi.list({ status: 'OPEN', limit: 5 }),
      reconciliationApi.listRuns(),
    ]);
    return {
      stats: s.data as DashboardStats,
      exceptions: (e.data.data ?? e.data) as Exception[],
      runs: ((r.data as any).slice?.(0, 5) ?? []) as ReconciliationRun[]
    };
  });

  const stats = data?.stats;
  const exceptions = data?.exceptions ?? [];
  const runs = data?.runs ?? [];

  const triggerRun = async () => {
    setRunning(true);
    try {
      await reconciliationApi.triggerRun();
      await mutate();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg">
      <Header 
        title="Dashboard" 
        action={
          <button onClick={triggerRun} disabled={running || loading} className="btn-primary">
            {running ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running ? 'Running...' : 'Run Reconciliation'}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-8 space-y-6">
        <div className="text-sm font-medium" style={{ color: C.textSecondary }}>
          Today so far: <span style={{ color: C.textPrimary, fontWeight: 600 }}>{loading ? '...' : (stats?.resolved_today ?? 0)}</span> exceptions resolved
        </div>
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Open Exceptions" 
            value={loading ? '—' : (stats?.open_exceptions ?? 0)} 
            trend={stats?.critical_exceptions ? `${stats.critical_exceptions} critical` : undefined}
            isPositive={false}
          />
          <StatCard 
            label="Transaction Volume" 
            value={loading ? '—' : formatPaiseCompact(stats?.total_transaction_volume ?? '0')} 
          />
          <StatCard 
            label="Match Rate" 
            value={loading ? '—' : `${(stats?.reconciliation_rate ?? 0).toFixed(1)}%`} 
            trend="All time"
            isPositive={true}
          />
          <StatCard 
            label="Pending Actions" 
            value={loading ? '—' : (stats?.pending_approvals ?? 0)} 
          />
        </div>

        {/* Charts & Breakdowns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Exceptions by Type */}
          <div className="card p-6 flex flex-col h-[320px]">
            <h3 className="text-[14px] font-semibold mb-6" style={{ color: C.textPrimary }}>Exceptions by Type</h3>
            <div className="flex-1 overflow-auto space-y-4 pr-2">
              {!stats?.exceptions_by_type?.length ? (
                <div className="h-full flex items-center justify-center text-sm" style={{ color: C.textMuted }}>No data</div>
              ) : (
                stats.exceptions_by_type.slice(0, 8).map((item, i) => {
                  const max = Math.max(...stats.exceptions_by_type.map(x => x.count));
                  const pct = max > 0 ? (item.count / max) * 100 : 0;
                  return (
                    <Link key={item.type} href={`/exceptions?type=${item.type}`} className="flex items-center gap-4 hover:bg-gray-50 p-1 -mx-1 rounded transition-colors cursor-pointer">
                      <div className="text-[13px] font-medium w-[160px] truncate" style={{ color: C.textSecondary }}>
                        {item.type.replace(/_/g, ' ')}
                      </div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.neutralTint }}>
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: C.primary }}
                        />
                      </div>
                      <div className="text-[13px] font-mono text-right w-8" style={{ color: C.textPrimary }}>
                        {item.count}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Exceptions by Severity */}
          <div className="card p-6 flex flex-col h-[320px]">
            <h3 className="text-[14px] font-semibold mb-6" style={{ color: C.textPrimary }}>Exceptions by Severity</h3>
            <div className="flex-1 overflow-auto space-y-4 pr-2">
              {!stats?.exceptions_by_severity?.length ? (
                <div className="h-full flex items-center justify-center text-sm" style={{ color: C.textMuted }}>No data</div>
              ) : (
                stats.exceptions_by_severity.map((item) => {
                  const max = Math.max(...stats.exceptions_by_severity.map(x => x.count));
                  const pct = max > 0 ? (item.count / max) * 100 : 0;
                  
                  let barColor: string = C.neutralTint;
                  if (item.severity === 'CRITICAL') barColor = C.critical;
                  if (item.severity === 'HIGH') barColor = C.warning;
                  if (item.severity === 'MEDIUM') barColor = C.warning;
                  if (item.severity === 'LOW') barColor = C.success;

                  return (
                    <Link key={item.severity} href={`/exceptions?severity=${item.severity}`} className="flex items-center gap-4 hover:bg-gray-50 p-1 -mx-1 rounded transition-colors cursor-pointer">
                      <div className="w-[100px] shrink-0">
                        <StatusBadge severity={item.severity as any} />
                      </div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.neutralTint }}>
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <div className="text-[13px] font-mono text-right w-8" style={{ color: C.textPrimary }}>
                        {item.count}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Exceptions */}
          <div className="card flex flex-col">
            <div className="p-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
              <h3 className="text-[14px] font-semibold" style={{ color: C.textPrimary }}>Recent Exceptions</h3>
              <Link href="/exceptions" className="text-[12px] font-medium" style={{ color: C.primary }}>View all &rarr;</Link>
            </div>
            <div className="p-2 space-y-1">
              {exceptions.length === 0 ? (
                <div className="p-8 text-center text-[13px]" style={{ color: C.textMuted }}>All systems are reconciled. There are no open exceptions at this time.</div>
              ) : (
                exceptions.map(exc => (
                  <Link
                    key={exc.id}
                    href={`/exceptions?id=${exc.id}`} 
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge severity={exc.severity} />
                        <span className="text-[12px] font-mono" style={{ color: C.textMuted }}>{exc.exceptionId}</span>
                      </div>
                      <div className="text-[13px] truncate font-medium" style={{ color: C.textPrimary }}>
                        {exc.type.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-semibold"><Amount value={exc.financialImpact} /></div>
                      <div className="text-[11px]" style={{ color: C.textMuted }}>exposure</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Runs Trend Chart */}
          <div className="card flex flex-col">
            <div className="p-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
              <h3 className="text-[14px] font-semibold" style={{ color: C.textPrimary }}>Match Rate Trend</h3>
              <Link href="/reconciliation" className="text-[12px] font-medium" style={{ color: C.primary }}>View all &rarr;</Link>
            </div>
            <div className="flex-1 p-5 relative">
              {(() => {
                const completedRuns = runs.filter(r => r.status !== 'IN_PROGRESS' && r.status !== 'FAILED').reverse();
                if (completedRuns.length < 5) {
                  return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-sm font-medium" style={{ color: C.textMuted }}>
                        Run reconciliation to populate this chart
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.textMuted }}>
                        {completedRuns.length} of 5 required runs completed
                      </div>
                    </div>
                  );
                }

                const chartData = completedRuns.map(run => {
                  const rate = run.totalRecords > 0 ? (run.matchedCount / run.totalRecords) * 100 : 0;
                  return {
                    time: new Date(run.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    rate: parseFloat(rate.toFixed(1))
                  };
                });

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.primary} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={C.primary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.textMuted }} dy={10} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        formatter={(value: number) => [`${value}%`, 'Match Rate']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="rate" 
                        stroke={C.primary} 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorRate)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
