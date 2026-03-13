// ============================================================================
// BeeClaw Dashboard — 通用数据轮询 Hook
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollingReturn<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 5000,
): UsePollingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doFetch();
    const timer = setInterval(doFetch, intervalMs);
    return () => clearInterval(timer);
  }, [doFetch, intervalMs]);

  return { data, error, loading, refresh: doFetch };
}
