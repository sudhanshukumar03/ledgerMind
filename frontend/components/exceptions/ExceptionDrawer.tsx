import React, { useEffect, useState, useRef } from 'react';
import {
  exceptionsApi,
  actionsApi,
  aiApi,
  Exception,
  AiAnalysis,
} from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { StatusBadge } from '../ui/StatusBadge';
import { Amount } from '../ui/Amount';
import {
  Bot,
  User,
  Send,
  Loader2,
  Zap,
  ShieldAlert,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { PlainText } from '../ui/PlainText';
import { AiChatThread } from '../ai/AiChatThread';

function Confidence({ value }: { value: number }) {
  const color = value >= 80 ? C.success : value >= 50 ? C.warning : C.critical;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-[12px] font-semibold" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

const genId = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

export function ExceptionDrawer({
  id,
  onClose,
  triggerRef,
}: {
  id: string;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}) {
  const requestGeneration = useRef(0);
  const [activeTab, setActiveTab] = useState<'details' | 'ask_ai'>('details');
  const [exc, setExc] = useState<Exception | null>(null);

  const [proposing, setProposing] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const [loading, setLoading] = useState(true);

  // Return focus to the trigger row when drawer closes
  const handleClose = () => {
    onClose();
    // Defer so the drawer is unmounted before focus shift
    setTimeout(() => {
      triggerRef?.current?.focus();
    }, 0);
  };

  // Chat state removed as we use AiChatThread for one-shot investigation

  const [copied, setCopied] = useState(false);
  const handleCopyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('exception', id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', url.toString());
    }
  };

  useEffect(() => {
    ++requestGeneration.current;
    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setExc(null);
    setPaymentId('');
    setActionMsg('');
    setProposing(null);
    setError(null);
    exceptionsApi
      .get(id, controller.signal)
      .then((r) => {
        if (current) {
          setExc(r.data);
          if (r.data.primaryEntityType === 'PAYMENT')
            setPaymentId(r.data.primaryEntityId ?? '');
        }
      })
      .catch(() => {
        if (current) setError('Unable to load exception. Reopen to retry.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [id]);

  const propose = async (type: string, amount?: number) => {
    if (!exc) return;
    const generation = requestGeneration.current;
    setProposing(type);
    setActionMsg('');
    try {
      const result = await actionsApi.propose({
        exceptionId: exc.id,
        type,
        amount,
        ...(type === 'REFUND' ? { payment_id: paymentId } : {}),
        reason: `Proposed via exception detail for ${exc.exceptionId}`,
        idempotencyKey: genId(),
      });
      if (requestGeneration.current === generation)
        setActionMsg(
          `Action ${type}: ${result.data.status.replace(/_/g, ' ')}`,
        );
    } catch (e: any) {
      if (requestGeneration.current === generation)
        setActionMsg(`✗ ${e.response?.data?.message ?? 'Failed'}`);
    } finally {
      if (requestGeneration.current === generation) setProposing(null);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exception Details"
        className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-bg shadow-2xl z-50 flex flex-col animate-slide-left border-l"
        style={{ borderColor: C.border }}
      >
        {error && (
          <p role="alert" className="p-4" style={{ color: C.critical }}>
            {error}
          </p>
        )}
        {/* Header */}
        <div
          className="shrink-0 px-6 py-5 border-b flex items-start justify-between bg-surface"
          style={{ borderColor: C.border }}
        >
          {loading ? (
            <div
              className="h-6 w-32 animate-pulse rounded"
              style={{ backgroundColor: C.neutralTint }}
            />
          ) : exc ? (
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h2
                  className="text-[16px] font-bold"
                  style={{ color: C.textPrimary }}
                >
                  {exc.type.replace(/_/g, ' ')}
                </h2>
                <StatusBadge severity={exc.severity as any} />
              </div>
              <p
                className="text-[13px] font-mono"
                style={{ color: C.textMuted }}
              >
                {exc.exceptionId}
              </p>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1 ml-4 shrink-0">
            <button
              onClick={handleCopyLink}
              className="p-1 rounded-md transition-colors hover-bg-muted relative"
              title="Copy link to exception"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-gray-500" />
              )}
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded-md transition-colors hover-bg-muted"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs - Now just a single Details tab or maybe we can just keep the header, no tabs needed since there's only one. */}
        <div
          className="flex px-6 py-3 border-b bg-surface shrink-0 gap-2 items-center"
          style={{ borderColor: C.border }}
        >
          <button
            className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-colors`}
            style={{
              backgroundColor: C.primary,
              color: C.bg,
              borderColor: C.primary,
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            Details & AI Investigation
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-bg p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : !exc ? null : (
            <div className="space-y-6 animate-fade-in">
              {/* Core Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4 flex flex-col justify-center">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: C.textMuted }}
                  >
                    Exposure
                  </div>
                  <div
                    className="text-[18px] font-bold"
                    style={{ color: C.textPrimary }}
                  >
                    <Amount value={exc.financialImpact} />
                  </div>
                </div>
                <div className="card p-4 flex flex-col justify-center">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: C.textMuted }}
                  >
                    Status
                  </div>
                  <div>
                    <StatusBadge status={exc.status as any} />
                  </div>
                </div>
              </div>

              {/* Attributes */}
              <div className="card p-4">
                <h3
                  className="text-[12px] font-semibold uppercase tracking-wide mb-3"
                  style={{ color: C.textMuted }}
                >
                  Attributes
                </h3>
                <dl className="space-y-3 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <dt style={{ color: C.textMuted }}>Created</dt>
                    <dd
                      className="font-medium"
                      style={{ color: C.textPrimary }}
                    >
                      {new Date(exc.createdAt).toLocaleString('en-IN')}
                    </dd>
                  </div>
                  {exc.resolvedAt && (
                    <div className="flex justify-between gap-2">
                      <dt style={{ color: C.textMuted }}>Resolved</dt>
                      <dd
                        className="font-medium"
                        style={{ color: C.textPrimary }}
                      >
                        {new Date(exc.resolvedAt).toLocaleString('en-IN')}
                      </dd>
                    </div>
                  )}
                  {exc.differenceAmount && (
                    <div className="flex justify-between gap-2">
                      <dt style={{ color: C.textMuted }}>Difference</dt>
                      <dd
                        className="font-medium"
                        style={{ color: C.textPrimary }}
                      >
                        <Amount value={exc.differenceAmount} />
                      </dd>
                    </div>
                  )}
                  {exc.customerImpact && (
                    <div className="flex justify-between gap-2">
                      <dt style={{ color: C.textMuted }}>Customer Impact</dt>
                      <dd
                        className="font-medium text-right"
                        style={{ color: C.textPrimary }}
                      >
                        <PlainText text={exc.customerImpact} />
                      </dd>
                    </div>
                  )}
                </dl>
                {exc.description && (
                  <div
                    className="mt-4 pt-4 border-t"
                    style={{ borderColor: C.border }}
                  >
                    <h3
                      className="text-[12px] font-semibold uppercase tracking-wide mb-2"
                      style={{ color: C.textMuted }}
                    >
                      Description / Raw details
                    </h3>
                    <PlainText
                      text={exc.description}
                      className="text-[12px] p-2 rounded border font-mono break-all"
                      style={{
                        color: C.textSecondary,
                        backgroundColor: C.neutralTint,
                        borderColor: C.border,
                      }}
                    />
                  </div>
                )}
              </div>

              <div
                className="mt-6 pt-6 border-t"
                style={{ borderColor: C.border }}
              >
                <AiChatThread
                  exceptionId={id}
                  label={exc.exceptionId}
                  initialAnalysis={exc.aiAnalyses?.[0]}
                />
              </div>

              {/* Actions */}
              {exc.status !== 'RESOLVED' && (
                <div className="card p-4">
                  <h3
                    className="text-[12px] font-semibold uppercase tracking-wide mb-3"
                    style={{ color: C.textMuted }}
                  >
                    Human Override / Actions
                  </h3>
                  <div className="space-y-2">
                    {(exc.type === 'DUPLICATE_PAYMENT' ||
                      exc.type === 'BANK_PAYMENT_MISMATCH') && (
                      <div className="space-y-2">
                        <label className="text-sm" htmlFor="refund-payment">
                          Payment to refund
                        </label>
                        <select
                          id="refund-payment"
                          value={paymentId}
                          onChange={(e) => setPaymentId(e.target.value)}
                          className="w-full p-2 rounded border"
                          style={{
                            backgroundColor: C.surface,
                            color: C.textPrimary,
                          }}
                        >
                          <option value="">Select a captured payment</option>
                          {exc.eligiblePayments
                            ?.filter((p) => BigInt(p.remainingAmount) > 0n)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.paymentId}
                              </option>
                            ))}
                        </select>
                        <button
                          className="btn-primary w-full"
                          disabled={
                            !!proposing ||
                            !paymentId ||
                            !Number.isSafeInteger(Number(exc.financialImpact))
                          }
                          onClick={() =>
                            propose(
                              'REFUND',
                              Math.min(
                                Number(exc.financialImpact),
                                Number(
                                  exc.eligiblePayments?.find(
                                    (p) => p.id === paymentId,
                                  )?.remainingAmount ?? 0,
                                ),
                              ),
                            )
                          }
                        >
                          {proposing === 'REFUND'
                            ? 'Submitting…'
                            : 'Propose Refund'}
                        </button>
                      </div>
                    )}
                    <button
                      className="btn-secondary w-full"
                      disabled={!!proposing}
                      onClick={() => propose('MARK_REVIEWED')}
                    >
                      {proposing === 'MARK_REVIEWED'
                        ? 'Submitting…'
                        : 'Mark for Review'}
                    </button>
                    <button
                      className="btn-danger w-full"
                      disabled={!!proposing}
                      onClick={() => propose('ESCALATE')}
                    >
                      {proposing === 'ESCALATE'
                        ? 'Submitting…'
                        : 'Escalate to Admin'}
                    </button>
                  </div>
                  {actionMsg && (
                    <p
                      className={`mt-3 text-[12px] font-medium ${actionMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {actionMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
