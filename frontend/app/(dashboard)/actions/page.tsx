'use client';

import React, { useEffect, useState } from 'react';
import { actionsApi, Action } from '../../../lib/api-client';
import { useAuth } from '../../providers';
import { Header } from '../../../components/layout/Header';
import { ActionModal } from '../../../components/approvals/ActionModal';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Amount } from '../../../components/ui/Amount';
import { C } from '../../../lib/tokens';
import { Loader2, RefreshCcw, Link2, CheckSquare, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import useSWR from 'swr';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  REFUND:              <RefreshCcw className="w-4 h-4" />,
  CREATE_PAYMENT_LINK: <Link2 className="w-4 h-4" />,
  MARK_REVIEWED:       <CheckSquare className="w-4 h-4" />,
  ESCALATE:            <AlertTriangle className="w-4 h-4" />,
};

function ActionRow({ action, onReview, canApprove }: {
  action: Action;
  onReview: (action: Action) => void;
  canApprove: boolean;
}) {
  const isPending = action.status === 'PENDING_APPROVAL' || action.status === 'PROPOSED';
  return (
    <tr className="table-row-hover">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ color: C.textSecondary, backgroundColor: C.neutralTint }}>
            {TYPE_ICONS[action.type] ?? <span className="text-sm font-bold">•</span>}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium" style={{ color: C.textPrimary }}>{action.type.replace(/_/g, ' ')}</div>
            <div className="text-[12px] font-mono truncate max-w-[200px]" style={{ color: C.textMuted }}>{action.exceptionId}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><StatusBadge status={action.status} /></td>
      <td className="px-4 py-3 text-[14px] font-semibold text-right" style={{ color: C.textPrimary }}>
        {action.amount ? <Amount value={action.amount} /> : '—'}
      </td>
      <td className="px-4 py-3 text-[13px] max-w-[200px] truncate" style={{ color: C.textSecondary }}>
        {action.reason}
      </td>
      <td className="px-4 py-3 text-[13px]" style={{ color: C.textSecondary }}>
        {new Date(action.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
      </td>
      <td className="px-4 py-3 text-right">
        {isPending && canApprove && (
          <button
            onClick={() => onReview(action)}
            className="px-4 py-1.5 text-[12px] font-bold rounded-md transition-colors"
            style={{ backgroundColor: C.primary, color: C.bg }}
          >
            Review Action
          </button>
        )}
      </td>
    </tr>
  );
}

export default function ActionsPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [reviewingAction, setReviewingAction] = useState<Action | null>(null);

  const canApprove = user?.role === 'ADMIN' || user?.role === 'FINANCE';

  const { data: actions = [], isLoading: loading, mutate } = useSWR(
    ['actions', statusFilter],
    () => actionsApi.list(statusFilter ? { status: statusFilter } : undefined)
            .then(r => r.data as any),
    { fallbackData: [] }
  );

  const handleModalComplete = (resultMsg: { type: 'success' | 'error', text: string }) => {
    setMsg(resultMsg);
    setReviewingAction(null);
    mutate();
  };

  const pendingCount = actions.filter(a => a.status === 'PENDING_APPROVAL' || a.status === 'PROPOSED').length;

  return (
    <div className="flex flex-col h-full bg-bg">
      <Header 
        title="Actions" 
        action={
          pendingCount > 0 && (
            <div 
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-bold"
              style={{ backgroundColor: C.warningTint, borderColor: `${C.warning}40`, color: C.warning }}
            >
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.warning }} />
              {pendingCount} pending approval
            </div>
          )
        }
      />

      <div className="flex-1 overflow-auto p-6 md:p-10 flex flex-col gap-8 max-w-[1200px] w-full mx-auto">
        
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

        {/* Filters */}
        <div 
          className="flex rounded-md p-1 shrink-0 w-fit"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          {['', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED', 'FAILED'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-4 py-1.5 text-[12px] font-medium transition-colors rounded"
              style={{ 
                backgroundColor: statusFilter === s ? C.primary : 'transparent',
                color: statusFilter === s ? C.bg : C.textSecondary,
              }}
            >
              {s.replace(/_/g, ' ') || 'All'}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                <tr>
                  {['Action', 'Status', 'Amount', 'Reason', 'Date', ''].map((h, i) => (
                    <th 
                      key={h} 
                      className={`px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap`}
                      style={{ color: C.textMuted, textAlign: h === 'Amount' ? 'right' : 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: C.border }}>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: C.primary }}/>
                    </td>
                  </tr>
                ) : actions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[13px]" style={{ color: C.textMuted }}>
                      No actions found
                    </td>
                  </tr>
                ) : (
                  actions.map(a => (
                    <ActionRow
                      key={a.id}
                      action={a}
                      onReview={setReviewingAction}
                      canApprove={canApprove}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {!canApprove && (
          <p className="text-[12px] text-center" style={{ color: C.textMuted }}>
            You have <strong className="font-bold">VIEWER</strong> access — only ADMIN and FINANCE roles can approve actions.
          </p>
        )}
      </div>

      {reviewingAction && (
        <ActionModal
          action={reviewingAction}
          onClose={() => setReviewingAction(null)}
          onComplete={handleModalComplete}
        />
      )}
    </div>
  );
}
