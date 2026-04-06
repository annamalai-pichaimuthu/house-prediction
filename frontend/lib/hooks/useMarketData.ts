import { useState, useEffect, useCallback, useRef } from "react";
import {
  javaClient,
  type InsightsResponse,
  type MarketStatistics,
  type WhatIfRequest,
  type WhatIfResponse,
} from "@/lib/api/java-client";

// ── Shared refresh key ────────────────────────────────────────────────────────
// Both useMarketInsights and useMarketStatistics subscribe to this so a single
// refresh() call re-fetches both endpoints simultaneously.

type RefreshListener = (key: number) => void;
let _refreshKey = 0;
const _listeners = new Set<RefreshListener>();

function _notifyAll() {
  _refreshKey += 1;
  _listeners.forEach((fn) => fn(_refreshKey));
}

function _useRefreshKey(): number {
  const [key, setKey] = useState(_refreshKey);
  useEffect(() => {
    _listeners.add(setKey);
    return () => { _listeners.delete(setKey); };
  }, []);
  return key;
}

// ── useMarketInsights ─────────────────────────────────────────────────────────

export function useMarketInsights() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const fetchKey = _useRefreshKey();

  useEffect(() => {
    setLoading(true);
    setError(null);
    javaClient
      .getInsights()
      .then(setInsights)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load market data"))
      .finally(() => setLoading(false));
  }, [fetchKey]);

  /** Evicts all server-side caches then re-fetches BOTH insights and statistics. */
  const refresh = useCallback(async () => {
    try {
      await javaClient.evictCaches();
    } catch {
      // Eviction failure is non-fatal — both hooks will still re-fetch; data may be slightly stale
    }
    _notifyAll();  // triggers re-fetch in every subscribed hook on this page
  }, []);

  return { insights, loading, error, refresh };
}

// ── useMarketStatistics ───────────────────────────────────────────────────────

export function useMarketStatistics() {
  const [statistics, setStatistics] = useState<MarketStatistics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const fetchKey = _useRefreshKey();  // re-fetches when refresh() is called anywhere on the page

  useEffect(() => {
    setLoading(true);
    setError(null);
    javaClient
      .getStatistics()
      .then(setStatistics)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load statistics"))
      .finally(() => setLoading(false));
  }, [fetchKey]);

  return { statistics, loading, error };
}

// ── useWhatIf ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

export function useWhatIf(initial: WhatIfRequest) {
  const [values,  setValues]  = useState<WhatIfRequest>(initial);
  const [result,  setResult]  = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // AbortController ref — cancelled when a newer request is queued
  const abortRef  = useRef<AbortController | null>(null);
  // Debounce timer ref
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runWhatIf = useCallback((req: WhatIfRequest) => {
    // Cancel any pending debounce
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Cancel in-flight request from previous slider position
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const res = await javaClient.whatIf(req, controller.signal);
        // Only commit result if this request wasn't superseded
        if (!controller.signal.aborted) setResult(res);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return; // superseded — ignore
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  // Run immediately on mount (baseline — no debounce needed)
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    javaClient.whatIf(initial, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setResult(res); })
      .catch((e: unknown) => { if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current)  clearTimeout(timerRef.current);
      if (abortRef.current)  abortRef.current.abort();
    };
  }, []);

  function updateField(key: keyof WhatIfRequest, value: number) {
    const next = { ...values, [key]: value };
    setValues(next);
    runWhatIf(next);
  }

  return { values, result, loading, error, updateField };
}
