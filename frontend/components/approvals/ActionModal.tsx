import React, { useEffect, useState } from 'react';
import { Action, Exception, exceptionsApi, actionsApi } from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { StatusBadge } from '../ui/StatusBadge';
import { Amount } from '../ui/Amount';
import { Loader2, AlertTriangle, ShieldAlert, X, AlertCircle } from 'lucide-react';

interface ActionModalProps {
  action: Action;
  onClose: () => void;
  onComplete: (msg: { type: 'success' | 'error', text: string }) => void;
}

export function ActionModal({ action, onClose, onComplete }: ActionModalProps) {
  const [exc, setExc] = useState<Exception | null>(null);
  const [excLoading, setExcLoading] = useState(true);
  const [excFailed, setExcFailed] = useState(false);
  const [reason, setReason] = useState(action.reason || '');
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    setExcLoading(true);
    setExcFailed(false);
    exceptionsApi.get(action.exceptionId)
      .then(r => setExc(r.data))
      .catch(() => setExcFailed(true))
      .finally(() => setExcLoading(false));
  }, [action.exceptionId]);

  const canApprove = user?.role === 'ADMIN';

  const handleApprove = async () => {
    if (!canApprove || !reason.trim() || submitting) return;
    setSubmitting('approve');
    setInlineError(null);
    try {
      await actionsApi.approve(action.id, reason);
      onComplete({ type: 'success', text: 'Action approved and queued for execution' });
    } catch (e: any) {
      // Stay open — show error inline
      setInlineError(e.response?.data?.message ?? 'Failed to approve. Please try again.');
      setSubmitting(null);
    }
  };

  const handleReject = async () => {
    if (!reason.trim() || submitting) return;
    setSubmitting('reject');
    setInlineError(null);
    try {
      await actionsApi.reject(action.id, reason);
      onComplete({ type: 'success', text: 'Action rejected' });
    } catch (e: any) {
      // Stay open — show error inline
      setInlineError(e.response?.data?.message ?? 'Failed to reject. Please try again.');
      setSubmitting(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-modal-title"
          className="bg-bg w-full max-w-4xl rounded-xl shadow-2xl z-50 flex flex-col max-h-[90vh] overflow-hidden animate-slide-up border"
          style={{ borderColor: C.border }}
        >
          
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between bg-surface" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5" style={{ color: C.warning }} />
              <h2 id="action-modal-title" className="text-[16px] font-bold" style={{ color: C.textPrimary }}>Review Action: {action.type.replace(/_/g, ' ')}</h2>
            </div>
            <button onClick={onClose} disabled={!!submitting} className="p-1 rounded-md transition-colors hover-bg-muted disabled:opacity-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Left Column: Current Exception State */}
            <div className="md:w-1/2 p-6 overflow-y-auto border-b md:border-b-0 md:border-r" style={{ borderColor: C.border, backgroundColor: '#F8FAFC' }}>
              {excLoading ? (
                <div className="flex flex-col items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" style={{ color: C.textMuted }} />
                  <span className="text-[12px]" style={{ color: C.textMuted }}>Loading exception state…</span>
                </div>
              ) : excFailed || !exc ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <AlertTriangle className="w-6 h-6" style={{ color: C.textMuted }} />
                  <span className="text-[12px]" style={{ color: C.textMuted }}>Unable to load current state</span>
                </div>
              ) : (
                <div className="space-y-5">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
                    Current state · {exc.exceptionId}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Status</div>
                      <StatusBadge status={exc.status as any} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Severity</div>
                      <StatusBadge severity={exc.severity as any} />
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                    <dl className="space-y-3 text-[13px]">
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: C.textMuted }}>Exception Type</dt>
                        <dd className="font-medium" style={{ color: C.textPrimary }}>{exc.type.replace(/_/g, ' ')}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: C.textMuted }}>Financial Exposure</dt>
                        <dd className="font-semibold tabular-nums text-right" style={{ color: C.textPrimary }}>
                          <Amount value={exc.financialImpact} />
                        </dd>
                      </div>
                      {exc.differenceAmount && (
                        <div className="flex justify-between gap-2">
                          <dt style={{ color: C.textMuted }}>Difference</dt>
                          <dd className="font-medium tabular-nums text-right" style={{ color: C.textPrimary }}>
                            <Amount value={exc.differenceAmount} />
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Proposed Action */}
            <div className="md:w-1/2 p-6 flex flex-col overflow-y-auto" style={{ backgroundColor: C.surface }}>
              <div
                className="mb-5 p-4 rounded-lg flex gap-3 border shrink-0"
                style={{ backgroundColor: C.warningTint, borderColor: `${C.warning}40`, color: C.warning }}
              >
                <ShieldAlert className="w-5 h-5 shrink-0 mt-px" />
                <div className="text-[13px]">
                  <strong className="font-bold block mb-1">Human Approval Required</strong>
                  AI recommendations must be reviewed by a human before execution.
                </div>
              </div>

              <div className="flex-1 space-y-4">
                {/* Proposed action — tinted */}
                <div
                  className="rounded-lg border p-4 space-y-3"
                  style={{ backgroundColor: C.primaryTint, borderColor: `${C.primary}20` }}
                >
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.primary }}>
                      Proposed Action
                    </div>
                    <div className="text-[15px] font-bold" style={{ color: C.textPrimary }}>
                      {action.type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  {action.amount && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.primary }}>Amount</div>
                      <div className="text-[14px] font-semibold tabular-nums" style={{ color: C.textPrimary }}>
                        <Amount value={action.amount} />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Original Reason</div>
                  <div
                    className="text-[13px] p-3 rounded-lg border font-mono"
                    style={{ color: C.textSecondary, borderColor: C.border, backgroundColor: C.bg }}
                  >
                    {action.reason}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="approval-reason"
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: C.textMuted }}
                  >
                    Review Note (Required)
                  </label>
                  <textarea
                    id="approval-reason"
                    className="input min-h-[80px] text-[13px]"
                    placeholder="Provide a reason for approval or rejection…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={!!submitting}
                  />
                </div>
              </div>

              {/* Inline error — stays open */}
              {inlineError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mt-4 flex items-start gap-2 p-3 rounded-lg border text-[13px]"
                  style={{ backgroundColor: C.criticalTint, borderColor: `${C.critical}40`, color: C.critical }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{inlineError}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-6 flex gap-3 pt-4 border-t shrink-0" style={{ borderColor: C.border }}>
                <button
                  onClick={handleReject}
                  disabled={!!submitting || !reason.trim()}
                  className="flex-1 btn-danger py-2.5"
                >
                  {submitting === 'reject'
                    ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    : 'Reject Action'}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!!submitting || !reason.trim()}
                  className="flex-1 btn-primary py-2.5"
                  style={{ backgroundColor: C.success, borderColor: C.success }}
                >
                  {submitting === 'approve'
                    ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    : 'Approve & Execute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
