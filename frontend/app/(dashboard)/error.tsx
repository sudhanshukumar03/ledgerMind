'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { C } from '../../lib/tokens';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-slide-up">
      <AlertTriangle className="w-12 h-12 mb-4" style={{ color: C.warning }} />
      <h2 className="text-lg font-bold mb-2" style={{ color: C.textPrimary }}>Something went wrong!</h2>
      <p className="text-sm mb-6 max-w-md" style={{ color: C.textSecondary }}>
        An unexpected error occurred while loading this view. Our team has been notified.
      </p>
      <button
        onClick={() => reset()}
        className="btn-primary"
      >
        Try again
      </button>
    </div>
  );
}
