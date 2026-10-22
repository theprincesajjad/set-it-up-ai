"use client";
import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { errorMessage, isApiError } from "@/lib/api/errors";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  /** HTTP status of the last error (402 = feature locked, 403 = role too low). */
  status: number | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (fn: T | null | ((d: T | null) => T | null)) => void;
}

/**
 * Client-side fetch with loading / error / reload. `fn` runs on mount and when `deps` change.
 * Pass `null` to skip (e.g. until a filter is ready).
 */
export function useApi<T>(fn: (() => Promise<T>) | null, deps: DependencyList, opts: { pollMs?: number } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(fn !== null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const seq = useRef(0);

  const run = useCallback(async (quiet = false) => {
    const f = fnRef.current;
    if (!f) return;
    const my = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const d = await f();
      if (my !== seq.current) return;
      setData(d);
      setError(null);
      setStatus(null);
    } catch (e) {
      if (my !== seq.current) return;
      setError(errorMessage(e));
      setStatus(isApiError(e) ? e.status : null);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data fetching on mount / dependency change is the point of this hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
    if (!opts.pollMs) return;
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void run(true);
    }, opts.pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, opts.pollMs]);

  return { data, error, status, loading, reload: () => run(true), setData: setData as ApiState<T>["setData"] };
}

/** Wrap an async action with busy + error state (forms, buttons). */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

/** Current time, fixed for the component's lifetime (render-pure "now" for display math). */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
