import React from 'react';

/**
 * Enforces plain-text rendering for untrusted AI output, bank descriptions, 
 * and merchant-supplied strings. React safely escapes all strings by default. 
 * This component guarantees no HTML is parsed or executed, neutralizing prompt injections.
 */
export function PlainText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  if (!text) return null;
  
  return (
    <div className={className} style={style}>
      {text.split('\n').map((line, i, arr) => (
        <React.Fragment key={i}>
          {line}
          {i !== arr.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  );
}
