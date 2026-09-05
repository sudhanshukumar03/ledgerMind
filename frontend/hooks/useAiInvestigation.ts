'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { exceptionsApi } from '../lib/api-client';
import { AiAnalysis } from '../lib/types';

export function useAiInvestigation(exceptionId: string, initialAnalysis?: AiAnalysis) {
  const [data, setData] = useState<AiAnalysis | undefined>(initialAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const reset = useCallback(() => {
    setData(initialAnalysis);
    setError(null);
    setLoading(false);
  }, [initialAnalysis]);

  const investigate = useCallback(async () => {
    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // Manual 15s timeout
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 15000);

      const res = await exceptionsApi.investigate(exceptionId);
      
      clearTimeout(timeoutId);
      
      if (!controller.signal.aborted) {
        setData(res.data);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED' || err.message === 'canceled') {
        if (controller.signal.aborted) {
          setError('Investigation timed out or was canceled.');
        }
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to investigate exception.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [exceptionId]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, investigate, reset };
}
