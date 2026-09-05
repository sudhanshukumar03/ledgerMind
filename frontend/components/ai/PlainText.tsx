import React from 'react';

export function PlainText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={className} style={style}>
      {text}
    </span>
  );
}
