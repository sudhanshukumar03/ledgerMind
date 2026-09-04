import React from 'react';
import { statusColor, severityColor } from '../../lib/tokens';

interface StatusBadgeProps {
  status?: string;
  severity?: string;
  label?: string; // Optional override for the text displayed
}

export function StatusBadge({ status, severity, label }: StatusBadgeProps) {
  // Determine if this is a status or severity badge
  const colors = severity ? severityColor(severity) : statusColor(status || 'UNKNOWN');
  
  const displayLabel = label || severity || status || 'UNKNOWN';

  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-[10px] py-[2px] text-[12px] font-semibold"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.text}20`, // Add a subtle border matching the text color with low opacity
      }}
    >
      {displayLabel.replace(/_/g, ' ')}
    </span>
  );
}
