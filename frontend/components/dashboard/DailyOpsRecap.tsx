import React from 'react';
import Link from 'next/link';
import { C } from '../../lib/tokens';
import { DashboardStats } from '../../lib/api-client';
import { formatPaise } from '../../lib/utils';
import { Skeleton } from '../ui/Skeleton';

interface DailyOpsRecapProps {
  metrics?: DashboardStats;
  loading?: boolean;
}

export function DailyOpsRecap({ metrics, loading }: DailyOpsRecapProps) {
  if (loading || !metrics) {
    return (
      <div className="card p-4 flex items-center">
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  const buildRecap = () => {
    const clauses: React.ReactNode[] = [];

    if (metrics.resolved_today > 0) {
      clauses.push(
        <span key="resolved">
          {metrics.resolved_today} exceptions <Link href="/exceptions?status=RESOLVED" className="font-semibold underline decoration-transparent hover:decoration-current transition-colors" style={{ color: C.success }}>resolved</Link>
        </span>
      );
    }

    if (metrics.critical_exceptions > 0) {
      clauses.push(
        <span key="critical">
          {metrics.critical_exceptions} <Link href="/exceptions?severity=CRITICAL" className="font-semibold underline decoration-transparent hover:decoration-current transition-colors" style={{ color: C.critical }}>critical</Link> issues require attention
        </span>
      );
    } else if (metrics.open_exceptions > 0) {
      clauses.push(
        <span key="open">
          {metrics.open_exceptions} <Link href="/exceptions" className="font-semibold underline decoration-transparent hover:decoration-current transition-colors" style={{ color: C.warning }}>open</Link> exceptions remain
        </span>
      );
    }

    if (metrics.pending_approvals > 0) {
      clauses.push(
        <span key="pending">
          {metrics.pending_approvals} actions <Link href="/actions" className="font-semibold underline decoration-transparent hover:decoration-current transition-colors" style={{ color: C.primary }}>pending approval</Link>
        </span>
      );
    }

    if (Number(metrics.total_transaction_volume) > 0) {
      clauses.push(
        <span key="volume">
          {formatPaise(metrics.total_transaction_volume)} processed
        </span>
      );
    }

    if (clauses.length === 0) {
      return <span>All quiet today — nothing new to report. ✅</span>;
    }

    return (
      <span>
        Today so far: {clauses.map((clause, i) => {
          if (i === 0) return clause;
          if (i === clauses.length - 1) {
            return clauses.length === 2 ? <span key={`sep-${i}`}> and {clause}</span> : <span key={`sep-${i}`}>, and {clause}</span>;
          }
          return <span key={`sep-${i}`}>, {clause}</span>;
        })}.
      </span>
    );
  };

  return (
    <div className="card p-4 text-sm font-medium" style={{ color: C.textSecondary }}>
      {buildRecap()}
    </div>
  );
}
