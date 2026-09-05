'use client';

import { C } from '../../lib/tokens';

interface FilterOption {
  key: string;
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: { status: string; severity: string };
  onFilterChange: (key: string, value: string) => void;
  onClearAll?: () => void;
}

const severityOptions: FilterOption[] = [
  { key: 'severity', value: 'CRITICAL', label: 'Critical' },
  { key: 'severity', value: 'HIGH', label: 'High' },
  { key: 'severity', value: 'MEDIUM', label: 'Medium' },
  { key: 'severity', value: 'LOW', label: 'Low' },
];

const statusOptions: FilterOption[] = [
  { key: 'status', value: 'OPEN', label: 'Open' },
  { key: 'status', value: 'INVESTIGATING', label: 'Investigating' },
  { key: 'status', value: 'RESOLVED', label: 'Resolved' },
];

export function FilterBar({ filters, onFilterChange, onClearAll }: FilterBarProps) {
  const isActive = (key: keyof typeof filters, value: string) => filters[key] === value;

  const hasActiveFilters = (filters.severity !== '' && filters.severity !== undefined) || (filters.status !== '' && filters.status !== 'OPEN' && filters.status !== undefined);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Severity group */}
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">
        Severity:
      </span>
      {severityOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() =>
            onFilterChange(opt.key, isActive(opt.key as any, opt.value) ? '' : opt.value)
          }
          className="text-[12px] rounded-full px-3 py-1 font-medium transition-colors focus:outline-none"
          style={{
            backgroundColor: isActive(opt.key as any, opt.value) ? C.primary : 'transparent',
            color: isActive(opt.key as any, opt.value) ? C.bg : C.textSecondary,
            borderColor: isActive(opt.key as any, opt.value) ? C.primary : C.border,
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
          aria-pressed={isActive(opt.key as any, opt.value)}
        >
          {opt.label}
        </button>
      ))}

      {/* Divider */}
      <span className="w-px h-6 mx-2" style={{ backgroundColor: C.border }} />

      {/* Status group */}
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">
        Status:
      </span>
      {statusOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() =>
            onFilterChange(opt.key, isActive(opt.key as any, opt.value) ? '' : opt.value)
          }
          className="text-[12px] rounded-full px-3 py-1 font-medium transition-colors focus:outline-none"
          style={{
            backgroundColor: isActive(opt.key as any, opt.value) ? C.primary : 'transparent',
            color: isActive(opt.key as any, opt.value) ? C.bg : C.textSecondary,
            borderColor: isActive(opt.key as any, opt.value) ? C.primary : C.border,
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
          aria-pressed={isActive(opt.key as any, opt.value)}
        >
          {opt.label}
        </button>
      ))}
      
      {onClearAll && (filters.severity || filters.status) && (
        <button 
          onClick={onClearAll}
          className="text-[12px] rounded-full px-3 py-1 font-medium text-gray-500 hover:text-gray-700 transition-colors ml-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
