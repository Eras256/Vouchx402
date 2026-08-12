"use client";

import { useEffect, useState } from "react";
import { fetchMetrics, fetchActivity, type Metrics, type ActivityItem, type ApiNetwork } from "@/lib/vouch402";

const REFRESH_MS = 30_000;

interface Resource<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
}

/** Real counters from GET /v1/metrics, refetched every 30s. Aborts the
 * in-flight request on unmount so a slow, stale response can never land
 * after a newer one.
 *
 * Deliberately doesn't reset `loading`/`error` synchronously when
 * `network` changes (that's a setState-in-effect anti-pattern React's own
 * lint rule flags, not a style nit) — a real tradeoff only if `network`
 * ever actually changes post-mount, which it doesn't at either of this
 * hook's call sites today (both are pinned to "base", see
 * live-stats.tsx/recent-activity.tsx). If that changes, prior data would
 * stay visible during the refetch instead of clearing to a loading
 * state — acceptable, and worth revisiting only then. */
export function useMetrics(network: ApiNetwork): Resource<Metrics> {
  const [state, setState] = useState<Resource<Metrics>>({ data: null, error: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      try {
        const data = await fetchMetrics(network, controller.signal);
        if (!cancelled) setState({ data, error: false, loading: false });
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setState((prev) => ({ ...prev, error: true, loading: false }));
        }
      }
    }

    run();
    const interval = setInterval(run, REFRESH_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [network]);

  return state;
}

/** Real recent fulfillments/disputes from GET /v1/activity, refetched
 * every 30s. Same abort-on-unmount/network-change discipline as
 * useMetrics. */
export function useActivity(network: ApiNetwork, limit: number): Resource<ActivityItem[]> {
  const [state, setState] = useState<Resource<ActivityItem[]>>({ data: null, error: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      try {
        const data = await fetchActivity(network, limit, controller.signal);
        if (!cancelled) setState({ data, error: false, loading: false });
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setState((prev) => ({ ...prev, error: true, loading: false }));
        }
      }
    }

    run();
    const interval = setInterval(run, REFRESH_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [network, limit]);

  return state;
}
