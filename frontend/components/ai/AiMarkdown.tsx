import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { StatusBadge } from '../ui/StatusBadge';
import React from 'react';

function processChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts = child.split(/(EXC-\d{14}-\d{3}|CRITICAL|HIGH|MEDIUM|LOW|OPEN|CLOSED|RESOLVED|₹[\d,.]+)/g);
      return parts.map((part, i) => {
        if (/^EXC-\d{14}-\d{3}$/.test(part)) {
          return <Link key={i} href={`/exceptions/${part}`} className="text-blue-600 hover:underline font-mono">{part}</Link>;
        }
        if (/^(CRITICAL|HIGH|MEDIUM|LOW)$/.test(part)) {
          return <StatusBadge key={i} severity={part} />;
        }
        if (/^(OPEN|CLOSED|RESOLVED)$/.test(part)) {
          return <StatusBadge key={i} status={part} />;
        }
        if (/^₹[\d,.]+$/.test(part)) {
          return <strong key={i} className="font-semibold">{part}</strong>;
        }
        return part;
      });
    }
    return child;
  });
}

function isNumericCell(children: React.ReactNode): boolean {
  if (typeof children === 'string') {
    return /^[-+]?₹/.test(children) || /^\d+×$/.test(children);
  }
  let isNum = false;
  React.Children.forEach(children, (child) => {
    if (typeof child === 'string' && (/^[-+]?₹/.test(child) || /^\d+×$/.test(child))) {
      isNum = true;
    }
  });
  return isNum;
}

export function AiMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse border border-slate-200">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-semibold text-slate-900 whitespace-nowrap">
            {children}
          </th>
        ),
        tr: ({ children }) => (
          <tr className="even:bg-slate-50 hover:bg-slate-100 transition-colors">{children}</tr>
        ),
        td: ({ children }) => {
          const numeric = isNumericCell(children);
          return (
            <td className={`border border-slate-200 px-4 py-2 text-sm text-slate-700 ${numeric ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
              {processChildren(children)}
            </td>
          );
        },
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-900">{children}</strong>
        ),
        code: ({ children }) => {
          if (typeof children === 'string' && /^EXC-\d{14}-\d{3}$/.test(children)) {
            return <Link href={`/exceptions/${children}`} className="text-blue-600 hover:underline font-mono bg-slate-100 rounded px-1 py-0.5 text-sm">{children}</Link>;
          }
          return (
            <code className="bg-slate-100 rounded px-1 py-0.5 font-mono text-sm text-slate-800">
              {children}
            </code>
          );
        },
        h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-md font-bold mt-3 mb-2">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{processChildren(children)}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{processChildren(children)}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
