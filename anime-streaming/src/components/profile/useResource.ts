"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the loader; keeps the previous data visible while refetching. */
  reload: () => void;
  /** Local override, e.g. after a mutation returns a fresh payload. */
  set: (value: T) => void;
}

/** The answer of the last finished attempt, tagged with the attempt it answers. */
interface Settled<T> {
  attempt: number;
  data: T | null;
  error: string | null;
}

/**
 * Minimal fetch-with-retry primitive shared by every profile tab: it owns the
 * loading / error / retry triad so no tab can silently render an empty page.
 * `load` must reject on failure — swallowed nulls are treated as errors by the
 * callers that need to.
 *
 * The attempt counter is the only thing the effect reads, and the only state it
 * writes is the settled answer, from the promise callbacks. That is what keeps
 * "started loading" out of the effect body: an attempt nobody has answered yet
 * *is* the loading state, so it is derived during render instead of stored.
 * `load` is re-read on every attempt rather than subscribed to, so callers may
 * hand over a fresh closure each render; `reload()` is the only way to refetch.
 */
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({
    attempt: -1,
    data: null,
    error: null,
  });

  const run = useEffectEvent(load);

  useEffect(() => {
    let cancelled = false;
    run().then(
      (value) => {
        if (cancelled) return;
        setSettled({ attempt, data: value, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        // A failed refetch keeps the data already on screen; only the error is new.
        setSettled((prev) => ({
          attempt,
          data: prev.data,
          error: err instanceof Error ? err.message : "Что-то пошло не так.",
        }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const pending = settled.attempt !== attempt;

  return {
    data: settled.data,
    loading: pending,
    // A retry clears the previous message the moment it starts, not when it lands.
    error: pending ? null : settled.error,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
    set: useCallback((value: T) => {
      setSettled((prev) => ({ ...prev, data: value }));
    }, []),
  };
}
