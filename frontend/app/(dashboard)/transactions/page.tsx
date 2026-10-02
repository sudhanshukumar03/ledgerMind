'use client';

import React, { useEffect, useState } from 'react';
import { transactionsApi, Payment, Settlement } from '../../../lib/api-client';
import { Header } from '../../../components/layout/Header';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Amount } from '../../../components/ui/Amount';
import { Pagination } from '../../../components/ui/Pagination';
import { TransactionDrawer } from '../../../components/transactions/TransactionDrawer';
import { C } from '../../../lib/tokens';
import { Loader2, Search, X } from 'lucide-react';

type Tab = 'payments' | 'settlements';

const PAYMENT_STATUSES = ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const SETTLEMENT_STATUSES = ['CREATED', 'PROCESSED', 'FAILED'];
const PAYMENT_METHODS = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];

export default function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');

  // Row drill-down drawer
  const [selected, setSelected] = useState<{ kind: 'payment' | 'settlement'; id: string } | null>(null);

  const hasFilters = search !== '' || status !== '' || method !== '';

  const resetFilters = () => {
    setSearch(''); setDebouncedSearch(''); setStatus(''); setMethod(''); setPage(1);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
    setSearch(''); setDebouncedSearch(''); setStatus(''); setMethod('');
  };

  // Debounce the search box (~300ms), resetting to page 1 on change.
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset to page 1 whenever a dropdown filter changes.
  useEffect(() => { setPage(1); }, [status, method]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    if (tab === 'payments') {
      transactionsApi.listPayments({ page, limit: LIMIT, search: debouncedSearch || undefined, status: status || undefined, method: method || undefined })
        .then(r => { if (!ignore) { setPayments(r.data.data); setTotal(r.data.total); } })
        .catch(() => { if (!ignore) { setPayments([]); setTotal(0); } })
        .finally(() => { if (!ignore) setLoading(false); });
    } else {
      transactionsApi.listSettlements({ page, limit: LIMIT, search: debouncedSearch || undefined, status: status || undefined })
        .then(r => { if (!ignore) { setSettlements(r.data.data); setTotal(r.data.total); } })
        .catch(() => { if (!ignore) { setSettlements([]); setTotal(0); } })
        .finally(() => { if (!ignore) setLoading(false); });
    }
    // Guard against out-of-order responses: a stale request resolving after a
    // newer filter change must not overwrite the current list.
    return () => { ignore = true; };
  }, [tab, page, debouncedSearch, status, method]);

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
              onClick={() => switchTab(t)}
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

        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 pointer-events-none" style={{ color: C.textMuted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'payments' ? 'Search by Payment ID' : 'Search by ID / UTR'}
              className="w-[240px] pl-9 pr-3 py-1.5 text-[13px] rounded-md outline-none focus:ring-2"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.textPrimary }}
            />
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="py-1.5 px-3 text-[13px] rounded-md outline-none cursor-pointer"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: status ? C.textPrimary : C.textMuted }}
          >
            <option value="">All statuses</option>
            {(tab === 'payments' ? PAYMENT_STATUSES : SETTLEMENT_STATUSES).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {tab === 'payments' && (
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="py-1.5 px-3 text-[13px] rounded-md outline-none cursor-pointer"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: method ? C.textPrimary : C.textMuted }}
            >
              <option value="">All methods</option>
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}

          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded hover-bg-muted"
              style={{ color: C.textMuted }}
            >
              <X className="w-3.5 h-3.5" /> Reset
            </button>
          )}
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
                      <tr
                        key={p.id}
                        className="table-row-hover cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                        tabIndex={0}
                        role="button"
                        aria-label={`View payment ${p.paymentId}`}
                        onClick={() => setSelected({ kind: 'payment', id: p.id })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ kind: 'payment', id: p.id }); } }}
                      >
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
                      <tr
                        key={s.id}
                        className="table-row-hover cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                        tabIndex={0}
                        role="button"
                        aria-label={`View settlement ${s.settlementId}`}
                        onClick={() => setSelected({ kind: 'settlement', id: s.id })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ kind: 'settlement', id: s.id }); } }}
                      >
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

      {selected && (
        <TransactionDrawer
          kind={selected.kind}
          id={selected.id}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
