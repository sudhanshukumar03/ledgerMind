'use client';

import React, { useEffect, useState } from 'react';
import { transactionsApi, Payment, Settlement } from '../../../lib/api-client';
import { Header } from '../../../components/layout/Header';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Amount } from '../../../components/ui/Amount';
import { Pagination } from '../../../components/ui/Pagination';
import { C } from '../../../lib/tokens';
import { Loader2 } from 'lucide-react';

type Tab = 'payments' | 'settlements';

export default function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    if (tab === 'payments') {
      transactionsApi.listPayments({ page, limit: LIMIT })
        .then(r => {
          const d = r.data as any;
          setPayments(d.data ?? d);
          setTotal(d.total ?? (d.data ?? d).length);
        })
        .catch(() => setPayments([]))
        .finally(() => setLoading(false));
    } else {
      transactionsApi.listSettlements({ page, limit: LIMIT })
        .then(r => {
          const d = r.data as any;
          setSettlements(d.data ?? d);
          setTotal(d.total ?? (d.data ?? d).length);
        })
        .catch(() => setSettlements([]))
        .finally(() => setLoading(false));
    }
  }, [tab, page]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col h-full bg-bg">
      <Header title="Transactions" />

      <div className="flex-1 overflow-auto p-6 md:p-10 flex flex-col gap-8 max-w-[1200px] w-full mx-auto">
        
        {/* Tabs */}
        <div 
          className="flex rounded-md p-1 w-fit"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          {(['payments', 'settlements'] as Tab[]).map(t => (
            <button 
              key={t} 
              onClick={() => { setTab(t); setPage(1); }}
              className="px-4 py-1.5 text-[13px] font-medium capitalize transition-colors rounded"
              style={{ 
                backgroundColor: tab === t ? C.primary : 'transparent',
                color: tab === t ? C.bg : C.textSecondary,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Table Card */}
        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {tab === 'payments' ? (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                  <tr>
                    {['Payment ID', 'Amount', 'Status', 'Method', 'Created'].map((h, i) => (
                      <th 
                        key={h} 
                        className={`px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap`}
                        style={{ color: C.textMuted, textAlign: i === 1 ? 'right' : 'left' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: C.border }}>
                  {loading
                    ? <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: C.primary }}/></td></tr>
                    : payments.length === 0
                    ? <tr><td colSpan={5} className="text-center py-12 text-[13px]" style={{ color: C.textMuted }}>No payments found</td></tr>
                    : payments.map(p => (
                      <tr key={p.id} className="table-row-hover">
                        <td className="px-4 py-3 text-[13px] font-mono" style={{ color: C.textSecondary }}>{p.paymentId}</td>
                        <td className="px-4 py-3 text-[14px] font-semibold text-right" style={{ color: C.textPrimary }}><Amount value={p.amount} /></td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          {p.method && (
                            <span 
                              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
                              style={{ backgroundColor: C.neutralTint, color: C.textSecondary }}
                            >
                              {p.method}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px]" style={{ color: C.textSecondary }}>{new Date(p.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                  <tr>
                    {['Settlement ID', 'Amount', 'Status', 'UTR', 'Date'].map((h, i) => (
                      <th 
                        key={h} 
                        className={`px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap`}
                        style={{ color: C.textMuted, textAlign: i === 1 ? 'right' : 'left' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: C.border }}>
                  {loading
                    ? <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: C.primary }}/></td></tr>
                    : settlements.length === 0
                    ? <tr><td colSpan={5} className="text-center py-12 text-[13px]" style={{ color: C.textMuted }}>No settlements found</td></tr>
                    : settlements.map(s => (
                      <tr key={s.id} className="table-row-hover">
                        <td className="px-4 py-3 text-[13px] font-mono" style={{ color: C.textSecondary }}>{s.settlementId}</td>
                        <td className="px-4 py-3 text-[14px] font-semibold text-right" style={{ color: C.textPrimary }}><Amount value={s.amount} /></td>
                        <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                        <td className="px-4 py-3 text-[13px] font-mono" style={{ color: C.textSecondary }}>{s.utr ?? '—'}</td>
                        <td className="px-4 py-3 text-[13px]" style={{ color: C.textSecondary }}>{new Date(s.settlementDate).toLocaleDateString('en-US', { dateStyle: 'medium' })}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            )}
          </div>
          
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
