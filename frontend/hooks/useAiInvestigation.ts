'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { exceptionsApi } from '../lib/api-client';
import { AiAnalysis } from '../lib/types';

export function useAiInvestigation(
  exceptionId: string,
  initialAnalysis?: AiAnalysis,
) {
  const [scopedData, setData] = useState({
    id: exceptionId,
    value: initialAnalysis,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setData({ id: exceptionId, value: initialAnalysis });
    setError(null);
    setLoading(false);
  }, [initialAnalysis, exceptionId]);
  useEffect(() => {
    reset();
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [exceptionId, reset]);
  const investigate = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await exceptionsApi.investigate(
        exceptionId,
        controller.signal,
      );
      if (active.current === controller && !controller.signal.aborted)
        setData({ id: exceptionId, value: res.data });
    } catch (err: any) {
      if (active.current === controller)
        setError(
          controller.signal.aborted
            ? 'Investigation timed out. Try again.'
            : err.response?.data?.message || 'Investigation failed.',
        );
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }, [exceptionId]);
  return {
    data: scopedData.id === exceptionId ? scopedData.value : initialAnalysis,
    loading,
    error,
    investigate,
    reset,
  };
}
