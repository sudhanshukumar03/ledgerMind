'use client';

import React, { useEffect, useState } from 'react';
import { transactionsApi, PaymentDetail, SettlementDetail } from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { StatusBadge } from '../ui/StatusBadge';
import { Amount } from '../ui/Amount';
import { PlainText } from '../ui/PlainText';
import { X, Loader2 } from 'lucide-react';

type Kind = 'payment' | 'settlement';

const fmtDateTime = (v: string) =>
  new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDate = (v: string) =>
  new Date(v).toLocaleDateString('en-US', { dateStyle: 'medium' });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-[13px]" style={{ color: C.textMuted }}>{label}</dt>
      <dd className="text-[13px] font-medium text-right" style={{ color: C.textPrimary }}>{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: C.textMuted }}>
      {children}
    </h3>
  );
}

export function TransactionDrawer({
  kind,
  id,
  onClose,
  triggerRef,
}: {
  kind: Kind;
  id: string;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}) {
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [settlement, setSettlement] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const handleClose = () => {
    onClose();
    setTimeout(() => triggerRef?.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setLoading(true);
    setPayment(null);
    setSettlement(null);
    const req = kind === 'payment' ? transactionsApi.getPayment(id) : transactionsApi.getSettlement(id);
    req
      .then((r) => {
        if (kind === 'payment') setPayment(r.data as PaymentDetail);
        else setSettlement(r.data as SettlementDetail);
      })
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, [kind, id]);

  const externalId = kind === 'payment' ? payment?.paymentId : settlement?.settlementId;
  const status = kind === 'payment' ? payment?.status : settlement?.status;
  const amount = kind === 'payment' ? payment?.amount : settlement?.amount;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={handleClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={kind === 'payment' ? 'Payment Details' : 'Settlement Details'}
        className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-bg shadow-2xl z-50 flex flex-col animate-slide-left border-l"
        style={{ borderColor: C.border }}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b flex items-start justify-between bg-surface" style={{ borderColor: C.border }}>
          {loading ? (
            <div className="h-6 w-40 animate-pulse rounded" style={{ backgroundColor: C.neutralTint }} />
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-[16px] font-bold" style={{ color: C.textPrimary }}>
                  {kind === 'payment' ? 'Payment' : 'Settlement'}
                </h2>
                {status && <StatusBadge status={status} />}
              </div>
              <p className="text-[13px] font-mono" style={{ color: C.textMuted }}>{externalId}</p>
            </div>
          )}
          <button onClick={handleClose} className="p-1 rounded-md transition-colors hover-bg-muted ml-4 shrink-0" title="Close">
            <X className="w-5 h-5" style={{ color: C.textMuted }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-bg p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.textMuted }} />
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* Amount */}
              <div className="card p-4 flex flex-col justify-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Amount</div>
                <div className="text-[20px] font-bold"><Amount value={amount} /></div>
              </div>

              {/* PAYMENT DETAILS */}
              {kind === 'payment' && payment && (
                <>
                  <div className="card p-4">
                    <SectionTitle>Attributes</SectionTitle>
                    <dl className="divide-y" style={{ borderColor: C.border }}>
                      {payment.method && <Field label="Method">{payment.method}</Field>}
                      {payment.currency && <Field label="Currency">{payment.currency}</Field>}
                      <Field label="Created">{fmtDateTime(payment.createdAt)}</Field>
                      {payment.capturedAt && <Field label="Captured">{fmtDateTime(payment.capturedAt)}</Field>}
                    </dl>
                  </div>

                  <div className="card p-4">
                    <SectionTitle>Linked Order</SectionTitle>
                    {payment.order ? (
                      <dl className="divide-y" style={{ borderColor: C.border }}>
                        <Field label="Order ID"><span className="font-mono">{payment.order.orderId}</span></Field>
                        <Field label="Amount"><Amount value={payment.order.amount} /></Field>
                        <Field label="Status"><StatusBadge status={payment.order.status} /></Field>
                        {payment.order.customerId && <Field label="Customer"><span className="font-mono">{payment.order.customerId}</span></Field>}
                      </dl>
                    ) : (
                      <p className="text-[13px]" style={{ color: C.textMuted }}>No linked order.</p>
                    )}
                  </div>

                  <div className="card p-4">
                    <SectionTitle>Refunds ({payment.refunds.length})</SectionTitle>
                    {payment.refunds.length === 0 ? (
                      <p className="text-[13px]" style={{ color: C.textMuted }}>No refunds.</p>
                    ) : (
                      <ul className="space-y-2">
                        {payment.refunds.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-3 rounded-md p-2" style={{ backgroundColor: C.neutralTint }}>
                            <div className="min-w-0">
                              <div className="text-[13px] font-mono truncate" style={{ color: C.textPrimary }}>{r.refundId}</div>
                              <div className="text-[11px]" style={{ color: C.textMuted }}>{fmtDateTime(r.createdAt)}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[13px] font-semibold"><Amount value={r.amount} /></span>
                              <StatusBadge status={r.status} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* SETTLEMENT DETAILS */}
              {kind === 'settlement' && settlement && (
                <>
                  <div className="card p-4">
                    <SectionTitle>Attributes</SectionTitle>
                    <dl className="divide-y" style={{ borderColor: C.border }}>
                      <Field label="UTR"><span className="font-mono">{settlement.utr ?? '—'}</span></Field>
                      <Field label="Settlement Date">{fmtDate(settlement.settlementDate)}</Field>
                    </dl>
                  </div>

                  <div className="card p-4">
                    <SectionTitle>Bank Transactions ({settlement.bankTransactions.length})</SectionTitle>
                    {settlement.bankTransactions.length === 0 ? (
                      <p className="text-[13px]" style={{ color: C.textMuted }}>No bank transactions linked.</p>
                    ) : (
                      <ul className="space-y-2">
                        {settlement.bankTransactions.map((b) => (
                          <li key={b.id} className="rounded-md p-2" style={{ backgroundColor: C.neutralTint }}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[13px] font-mono truncate" style={{ color: C.textPrimary }}>{b.bankTxnId}</div>
                                <div className="text-[11px]" style={{ color: C.textMuted }}>
                                  {b.transactionType} · {fmtDate(b.transactionDate)}{b.utr ? ` · UTR ${b.utr}` : ''}
                                </div>
                              </div>
                              <span className="text-[13px] font-semibold shrink-0"><Amount value={b.amount} /></span>
                            </div>
                            {b.description && (
                              <PlainText
                                text={b.description}
                                className="mt-1.5 text-[12px] break-words"
                                style={{ color: C.textSecondary }}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
