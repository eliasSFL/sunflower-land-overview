import { useCallback, useEffect, useState } from "react";

import {
  fetchAuctions,
  fetchMarketplaceActivity,
  type AuctionsData,
  type Fetched,
  type MarketplaceActivityData,
} from "../api/communityData.ts";

export type RemoteState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: Fetched<T> };

// Matches the Worker's soft TTL for these types — polling faster just
// re-serves the same cached copy. Long enough that the 1 Hz dashboard
// clock stays the only frequent re-render.
const REFRESH_MS = 5 * 60_000;

/**
 * Load one community data set, refreshing on an interval.
 *
 * `load` is the effect's only dependency, so callers pass a
 * `useCallback` keyed on whatever actually varies. A refresh that fails
 * leaves the last good value in place — the Worker already falls back
 * to its own stale copy, so an error here means even that was
 * unavailable, and blanking a rendered panel over it would be worse
 * than showing slightly old numbers.
 */
function useRemote<T>(
  load: (signal: AbortSignal) => Promise<Fetched<T>>,
): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        const value = await load(controller.signal);
        if (controller.signal.aborted) return;
        setState({ status: "ready", value });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to load";
        setState((prev) =>
          prev.status === "ready" ? prev : { status: "error", message },
        );
      }
    };

    void run();
    const timer = setInterval(() => void run(), REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return state;
}

/** The auction calendar (`/community/data?type=auctions`). */
export function useAuctions(): RemoteState<AuctionsData> {
  return useRemote(
    useCallback((signal: AbortSignal) => fetchAuctions(signal), []),
  );
}

/**
 * Marketplace trading activity. Omit `date` for today's report; the
 * Worker's cache key includes it, so a specific date is cached
 * separately from "latest".
 */
export function useMarketplaceActivity(
  date?: string,
): RemoteState<MarketplaceActivityData> {
  return useRemote(
    useCallback(
      (signal: AbortSignal) => fetchMarketplaceActivity(date, signal),
      [date],
    ),
  );
}
