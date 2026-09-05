import React from 'react';
import { C } from '../../lib/tokens';

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208 40" width="208" height="40" role="img" aria-label="LedgerMind" {...props}>
      <g transform="translate(0 4)">
        <g fill="none" stroke="#0F766E" strokeWidth="3.2" strokeLinecap="round">
          <path d="M5.5 9 H17.5"/><path d="M5.5 16 H19"/><path d="M5.5 23 H17.5"/>
        </g>
        <circle cx="25.5" cy="16" r="3.6" fill="#14B8A6"/>
      </g>
      <text x="40" y="28.5" fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" fontSize="25" fontWeight="600" letterSpacing="-0.9">
        <tspan style={{ fill: C.textPrimary }}>Ledger</tspan>
        <tspan fill="#0F766E">Mind</tspan>
      </text>
    </svg>
  );
}
