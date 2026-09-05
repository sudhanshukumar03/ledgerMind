import React from 'react';
import { C } from '../../lib/tokens';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md ${className}`}
      style={{ backgroundColor: C.border }}
      {...props}
    />
  );
}
