import React from 'react';
import { statusColor, severityColor } from '../../lib/tokens';

interface StatusBadgeProps {
  status?: string;
  severity?: string;
  label?: string; // Optional override for the text displayed
}

export function StatusBadge({ status, severity, label }: StatusBadgeProps) {
  const colors = severity ? severityColor(severity) : statusColor(status || 'UNKNOWN');
  const displayLabel = label || severity || status || 'UNKNOWN';
  const isCritical = (severity || status || '').toUpperCase() === 'CRITICAL';

  return (
    <span
      className="inline-flex items-center justify-center gap-1 rounded-full px-[10px] py-[2px] text-[12px] font-semibold"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.text}20`,
      }}
    >
      {isCritical && (
        <span aria-hidden="true" className="text-[8px] leading-none">●</span>
      )}
      {displayLabel.replace(/_/g, ' ')}
    </span>
  );
}
