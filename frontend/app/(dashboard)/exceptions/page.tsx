'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { exceptionsApi, Exception } from '../../../lib/api-client';
import { Header } from '../../../components/layout/Header';
import { ExceptionDrawer } from '../../../components/exceptions/ExceptionDrawer';
import { QuickInvestigatePopover } from '../../../components/exceptions/QuickInvestigatePopover';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Amount } from '../../../components/ui/Amount';
import { Pagination } from '../../../components/ui/Pagination';
import { FilterBar } from '../../../components/ui/FilterBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import { C } from '../../../lib/tokens';
import { Loader2, Search, Zap } from 'lucide-react';
import useSWR from 'swr';

function ExceptionsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeExceptionId = searchParams.get('exception');
  const pageFilter = parseInt(searchParams.get('page') || '1', 10);
  
  const statusFilter = searchParams.get('status') ?? 'OPEN';
  const severityFilter = searchParams.get('severity') ?? '';
  const search = searchParams.get('search') ?? '';

  const [popover, setPopover] = useState<{ open: boolean; anchorEl: HTMLElement | null; exception: Exception | null }>({
    open: false,
    anchorEl: null,
    exception: null
  });

  // Track which row opened the drawer so we can return focus on close
  const drawerTriggerRef = useRef<HTMLElement>(null);

  const updateFilters = (updates: { status?: string, severity?: string, search?: string, page?: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.status !== undefined) {
      if (updates.status) params.set('status', updates.status);
      else params.delete('status');
      if (updates.page === undefined) params.set('page', '1');
    }
    if (updates.severity !== undefined) {
      if (updates.severity) params.set('severity', updates.severity);
      else params.delete('severity');
      if (updates.page === undefined) params.set('page', '1');
    }
    if (updates.search !== undefined) {
      if (updates.search) params.set('search', updates.search);
      else params.delete('search');
      if (updates.page === undefined) params.set('page', '1');
    }
    if (updates.page !== undefined) {
      if (updates.page > 1) params.set('page', updates.page.toString());
      else params.delete('page');
    }
    router.push(`/exceptions?${params.toString()}`);
  };

  const { data: response, isLoading: loading } = useSWR(
    ['exceptions', statusFilter, severityFilter, pageFilter],
    () => exceptionsApi.list({ status: statusFilter || undefined, severity: severityFilter || undefined, limit: 20, page: pageFilter })
            .then(r => r.data),
    { fallbackData: { data: [], total: 0, page: 1, limit: 20 } }
  );

  const exceptions = response?.data || [];
  const total = response?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const filtered = exceptions.filter(e =>
    !search ||
    e.exceptionId.toLowerCase().includes(search.toLowerCase()) ||
    e.type.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        
        // Find hovered row or fallback to first row
        let row = document.querySelector('tr:hover') as HTMLElement;
        if (!row) {
          row = document.querySelector('tr[data-exception-id]') as HTMLElement;
        }

        if (row) {
          const excId = row.getAttribute('data-exception-id');
          const exc = filtered.find(x => x.id === excId);
          if (exc) {
            const btn = row.querySelector('.investigate-btn') as HTMLElement;
            setPopover({ open: true, anchorEl: btn || row, exception: exc });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered]);

  return (
    <div className="flex flex-col h-full bg-bg relative">
      <Header title="Exceptions" />

      <div className="flex-1 overflow-auto p-6 md:p-10 flex flex-col gap-8 max-w-[1200px] w-full mx-auto">
        
        {/* Search */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.textMuted }} />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 text-[13px] rounded-md focus:outline-none transition-colors"
              placeholder="Search by ID or type…"
              value={search}
              onChange={e => updateFilters({ search: e.target.value })}
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.textPrimary }}
            />
          </div>
        </div>

        {/* Filters */}
        <FilterBar 
          filters={{ status: statusFilter, severity: severityFilter }}
          onFilterChange={(k, v) => updateFilters({ [k]: v })}
          onClearAll={() => updateFilters({ status: '', severity: '' })}
        />

        {/* Table */}
        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                <tr>
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap" style={{ color: C.textMuted }}>Exception ID</th>
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap" style={{ color: C.textMuted }}>Type</th>
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap" style={{ color: C.textMuted }}>Severity</th>
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap" style={{ color: C.textMuted }}>Status</th>
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap text-right" style={{ color: C.textMuted }}>Exposure</th>
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap text-right" style={{ color: C.textMuted }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: C.border }}>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-6 w-3/4" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-6 w-1/2" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-6 w-1/2" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="h-6 w-20 ml-auto" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="h-8 w-8 ml-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[13px]" style={{ color: C.textMuted }}>
                      No exceptions found
                    </td>
                  </tr>
                ) : (
                  filtered.map(exc => (
                    <tr
                      key={exc.id}
                      tabIndex={0}
                      data-exception-id={exc.id}
                      className="table-row-hover group"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('.investigate-btn')) return;
                        (drawerTriggerRef as any).current = e.currentTarget;
                        router.push(`/exceptions?exception=${exc.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          (drawerTriggerRef as any).current = e.currentTarget;
                          router.push(`/exceptions?exception=${exc.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-3 text-[13px] font-mono" style={{ color: C.textSecondary }}>{exc.exceptionId}</td>
                      <td className="px-4 py-3 text-[13px] font-medium" style={{ color: C.textPrimary }}>{exc.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3"><StatusBadge severity={exc.severity} /></td>
                      <td className="px-4 py-3"><StatusBadge status={exc.status} /></td>
                      <td className="px-4 py-3 text-[14px] font-semibold text-right" style={{ color: C.textPrimary }}><Amount value={exc.financialImpact} /></td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          className="investigate-btn opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md border flex items-center justify-center shadow-sm hover-bg-muted ml-auto"
                          style={{ backgroundColor: C.surface, borderColor: C.border }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPopover({ open: true, anchorEl: e.currentTarget, exception: exc });
                          }}
                          title="Investigate with AI (Cmd+I)"
                        >
                          <Zap className="w-4 h-4" style={{ color: C.primary }} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-surface">
            {totalPages > 1 ? (
              <Pagination 
                currentPage={pageFilter} 
                totalPages={totalPages} 
                onPageChange={(p) => updateFilters({ page: p })} 
                isLoading={loading} 
              />
            ) : (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="px-4 py-3 border-t text-[12px]"
                style={{ borderColor: C.border, color: C.textMuted }}
              >
                {filtered.length} exception{filtered.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

      </div>
      {activeExceptionId && (
        <ExceptionDrawer
          id={activeExceptionId}
          triggerRef={drawerTriggerRef as React.RefObject<HTMLElement>}
          onClose={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('exception');
            router.push(`/exceptions?${params.toString()}`);
          }}
        />
      )}
      <QuickInvestigatePopover
        open={popover.open}
        anchorEl={popover.anchorEl}
        exception={popover.exception}
        onClose={() => setPopover({ ...popover, open: false })}
      />
    </div>
  );
}

export default function ExceptionsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading exceptions...</div>}>
      <ExceptionsList />
    </Suspense>
  );
}
