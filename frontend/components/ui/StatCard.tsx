import React from 'react';
import { C } from '../../lib/tokens';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string; // e.g., "+12%" or "-5%"
  isPositive?: boolean;
}

export function StatCard({ label, value, trend, isPositive = true }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 style={{ color: C.textMuted, fontSize: '13px', fontWeight: 500 }}>
          {label}
        </h3>
        {trend && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: isPositive ? C.successTint : C.criticalTint,
              color: isPositive ? C.success : C.critical,
            }}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="mt-2" style={{ color: C.textPrimary, fontSize: '24px', fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
