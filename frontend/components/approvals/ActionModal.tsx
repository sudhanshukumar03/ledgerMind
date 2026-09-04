import React, { useEffect, useState } from 'react';
import { Action, Exception, exceptionsApi, actionsApi } from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { StatusBadge } from '../ui/StatusBadge';
import { Amount } from '../ui/Amount';
import { Loader2, AlertTriangle, ShieldAlert, X } from 'lucide-react';

interface ActionModalProps {
  action: Action;
  onClose: () => void;
  onComplete: (msg: { type: 'success' | 'error', text: string }) => void;
}

export function ActionModal({ action, onClose, onComplete }: ActionModalProps) {
  const [exc, setExc] = useState<Exception | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState(action.reason || '');
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    exceptionsApi.get(action.exceptionId)
      .then(r => setExc(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [action.exceptionId]);

  const handleApprove = async () => {
    if (!reason.trim()) return;
    setSubmitting('approve');
    try {
      await actionsApi.approve(action.id, reason);
      onComplete({ type: 'success', text: 'Action approved and queued for execution' });
    } catch (e: any) {
      onComplete({ type: 'error', text: e.response?.data?.message ?? 'Failed to approve' });
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    setSubmitting('reject');
    try {
      await actionsApi.reject(action.id, reason);
      onComplete({ type: 'success', text: 'Action rejected' });
    } catch (e: any) {
      onComplete({ type: 'error', text: e.response?.data?.message ?? 'Failed to reject' });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity flex items-center justify-center p-4">
        <div className="bg-bg w-full max-w-4xl rounded-xl shadow-2xl z-50 flex flex-col max-h-[90vh] overflow-hidden animate-slide-up border" style={{ borderColor: C.border }}>
          
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between bg-surface" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5" style={{ color: C.warning }} />
              <h2 className="text-[16px] font-bold" style={{ color: C.textPrimary }}>Review Action: {action.type.replace(/_/g, ' ')}</h2>
            </div>
            <button onClick={onClose} disabled={!!submitting} className="p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Left Column: Exception State */}
            <div className="md:w-1/2 p-6 overflow-y-auto border-b md:border-b-0 md:border-r bg-gray-50/50" style={{ borderColor: C.border }}>
              {loading ? (
                <div className="flex flex-col items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400 mb-2" />
                  <span className="text-xs text-gray-500">Loading exception state...</span>
                </div>
              ) : exc ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[12px] font-bold uppercase tracking-wider mb-4" style={{ color: C.textMuted }}>
                      Current state &middot; {exc.exceptionId}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Status</div>
                        <div><StatusBadge status={exc.status as any} /></div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Severity</div>
                        <div><StatusBadge severity={exc.severity as any} /></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="card p-4">
                    <dl className="space-y-3 text-[13px]">
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: C.textMuted }}>Exception Type</dt>
                        <dd className="font-medium" style={{ color: C.textPrimary }}>{exc.type.replace(/_/g, ' ')}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: C.textMuted }}>Financial Exposure</dt>
                        <dd className="font-medium text-right" style={{ color: C.textPrimary }}><Amount value={exc.financialImpact} /></dd>
                      </div>
                      {exc.differenceAmount && (
                        <div className="flex justify-between gap-2">
                          <dt style={{ color: C.textMuted }}>Difference</dt>
                          <dd className="font-medium" style={{ color: C.textPrimary }}><Amount value={exc.differenceAmount} /></dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40">
                  <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
                  <span className="text-xs text-gray-500">Could not load exception details</span>
                </div>
              )}
            </div>

            {/* Right Column: Approval Context */}
            <div className="md:w-1/2 p-6 flex flex-col bg-surface">
              <div className="mb-6 p-4 rounded-lg flex gap-3 border" style={{ backgroundColor: C.warningTint, borderColor: `${C.warning}40`, color: C.warning }}>
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <div className="text-[13px]">
                  <strong className="font-bold block mb-1">Human Approval Required</strong>
                  AI recommendations and system actions must be reviewed and approved by a human operator before execution.
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>Proposed Action</label>
                  <div className="text-[14px] font-medium" style={{ color: C.textPrimary }}>
                    {action.type.replace(/_/g, ' ')} {action.amount ? `for ${<Amount value={action.amount} />}` : ''}
                  </div>
                </div>
                
                <div>
                  <label className="block text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>Original Reason / Context</label>
                  <div className="text-[13px] bg-gray-50 p-3 rounded border font-mono" style={{ color: C.textSecondary, borderColor: C.border }}>
                    {action.reason}
                  </div>
                </div>

                <div>
                  <label htmlFor="approval-reason" className="block text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>
                    Review Note (Required)
                  </label>
                  <textarea
                    id="approval-reason"
                    className="input min-h-[80px] text-[13px]"
                    placeholder="Provide a reason for approval or rejection..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={!!submitting}
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-8 flex gap-3 pt-4 border-t" style={{ borderColor: C.border }}>
                <button
                  onClick={handleReject}
                  disabled={!!submitting || !reason.trim()}
                  className="flex-1 btn-danger py-2.5"
                >
                  {submitting === 'reject' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reject Action'}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!!submitting || !reason.trim()}
                  className="flex-1 btn-primary py-2.5"
                  style={{ backgroundColor: C.success, borderColor: C.success }}
                >
                  {submitting === 'approve' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Approve & Execute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
