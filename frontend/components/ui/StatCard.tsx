import React from 'react';
import { C } from '../../lib/tokens';
import { Skeleton } from './Skeleton';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string; // e.g., "+12%" or "-5%"
  isPositive?: boolean;
  isLoading?: boolean;
  trendTooltip?: string;
  sparklineData?: number[];
}

export function StatCard({ label, value, trend, isPositive = true, isLoading = false, trendTooltip, sparklineData }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 style={{ color: C.textMuted, fontSize: '13px', fontWeight: 500 }}>
          {label}
        </h3>
        {trend && !isLoading && (
          <span
            title={trendTooltip}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${trendTooltip ? 'cursor-help' : ''}`}
            style={{
              backgroundColor: isPositive ? C.successTint : C.criticalTint,
              color: isPositive ? C.success : C.critical,
            }}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="mt-2" style={{ color: C.textPrimary, fontSize: '24px', fontWeight: 600, minHeight: '36px' }}>
        {isLoading ? (
          <Skeleton className="h-8 w-24 mt-1" />
        ) : (
          <div className="flex flex-row items-end justify-between">
            <span role="status" aria-live={label === 'Match Rate' ? 'polite' : 'off'}>{value}</span>
            {sparklineData && sparklineData.length > 0 && (
              <svg width="60" height="24" viewBox="0 0 60 24" className="mb-1" aria-hidden="true">
                <defs>
                  <linearGradient id={`sparkline-gradient-${label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPositive ? C.success : C.primary} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={isPositive ? C.success : C.primary} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  fill={`url(#sparkline-gradient-${label.replace(/\s+/g, '')})`}
                  points={
                    `${1},24 ` + 
                    sparklineData.map((d, i) => {
                      const max = Math.max(...sparklineData, 1);
                      const x = (i / Math.max(sparklineData.length - 1, 1)) * 58 + 1;
                      const y = 23 - (d / max) * 22;
                      return `${x},${y}`;
                    }).join(' ') + 
                    ` ${59},24`
                  }
                />
                <polyline 
                  fill="none" 
                  stroke={isPositive ? C.success : C.primary} 
                  strokeWidth="2" 
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklineData.map((d, i) => {
                    const max = Math.max(...sparklineData, 1);
                    const x = (i / Math.max(sparklineData.length - 1, 1)) * 58 + 1; // 1px padding
                    const y = 23 - (d / max) * 22; // 1px padding
                    return `${x},${y}`;
                  }).join(' ')} 
                />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
