import React from 'react';
import { C } from '../../lib/tokens';
import { formatPaise } from '../../lib/utils';

interface AmountProps {
  value: string | bigint | number | null | undefined; // Expected in paise
  color?: string; // Optional color override
  className?: string;
  showSign?: boolean; // Whether to show + or - explicitly
}

export function Amount({ value, color = C.textPrimary, className = '', showSign = false }: AmountProps) {
  if (value == null) {
    return <span className={className} style={{ color }}>-</span>;
  }

  let isNegative = false;
  let isPositive = false;
  let numericValue: bigint;

  try {
    numericValue = typeof value === 'bigint' ? value : BigInt(Math.floor(Number(value)));
    isNegative = numericValue < BigInt(0);
    isPositive = numericValue > BigInt(0);
  } catch {
    return <span className={className} style={{ color }}>-</span>;
  }
  
  // Format the absolute value using formatPaise (which handles BigInt/string correctly)
  // We remove the sign if it's there so we can prepend it based on showSign
  const absolutePaise = isNegative ? -numericValue : numericValue;
  const absFormatted = formatPaise(absolutePaise);
  
  // Construct the final string
  let displayString = absFormatted;
  if (showSign) {
    if (isPositive) displayString = `+${absFormatted}`;
    if (isNegative) displayString = `-${absFormatted}`;
  } else if (isNegative) {
    displayString = `-${absFormatted}`;
  }

  return (
    <span className={`font-mono ${className}`} style={{ color }}>
      {displayString}
    </span>
  );
}
