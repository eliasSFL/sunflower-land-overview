import { useCallback, useEffect, useState } from "react";

import {
  fetchAuctions,
  fetchMarketplaceActivity,
  fetchMarketplaceProfile,
  fetchTradeable,
  type AuctionsData,
  type Fetched,
  type MarketplaceActivityData,
  type MarketplaceProfileData,
  type TradeableData,
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

/**
 * One farm's marketplace profile. Access-gated in the Worker, so a farm
 * outside the overview's cohort resolves to an error state rather than
 * data — the page treats that the same as "no profile" and hides.
 */
export function useMarketplaceProfile(
  farmId: number | undefined,
): RemoteState<MarketplaceProfileData> {
  return useRemote(
    useCallback(
      (signal: AbortSignal) =>
        farmId === undefined
          ? // Never resolves for a caller with no farm yet. The page
            // only mounts once a farm has loaded, so this is the
            // pre-load window rather than a real state.
            new Promise<Fetched<MarketplaceProfileData>>(() => {})
          : fetchMarketplaceProfile(farmId, signal),
      [farmId],
    ),
  );
}

/**
 * One item's marketplace page. `null` for either argument parks the
 * hook — nothing is selected, so nothing is fetched. Hooks can't be
 * called conditionally, hence the sentinel rather than an early return
 * at the callsite.
 */
export function useTradeable(
  collection: string | null,
  id: number | null,
): RemoteState<TradeableData> {
  return useRemote(
    useCallback(
      (signal: AbortSignal) =>
        collection === null || id === null
          ? new Promise<Fetched<TradeableData>>(() => {})
          : fetchTradeable(collection, id, signal),
      [collection, id],
    ),
  );
}

/**
 * The last `days` daily reports, oldest first — the market's volume
 * trend. Each date is a separate request, but each is also a separate
 * Worker cache entry with a 24h hard TTL, so every day but today is
 * served from cache after its first fetch.
 *
 * Today is fetched WITHOUT a date param so it shares the cache entry
 * the headline panel already warms, rather than opening a second one
 * under today's date string.
 *
 * A day that fails is dropped rather than failing the set: a gap in the
 * trend is better than no trend, and the batch job genuinely has days
 * it never wrote.
 */
export function useMarketplaceTrend(
  days: number,
): RemoteState<Array<{ date: string; volume: number; trades: number }>> {
  return useRemote(
    useCallback(
      async (signal: AbortSignal) => {
        const today = new Date();
        const dates = Array.from({ length: days }, (_, i) => {
          const d = new Date(today);
          d.setUTCDate(d.getUTCDate() - (days - 1 - i));
          return d.toISOString().slice(0, 10);
        });
        const todayKey = dates[dates.length - 1];

        const results = await Promise.allSettled(
          dates.map((date) =>
            fetchMarketplaceActivity(
              date === todayKey ? undefined : date,
              signal,
            ),
          ),
        );

        let fetchedAt = 0;
        let stale = false;
        const points: Array<{ date: string; volume: number; trades: number }> =
          [];

        results.forEach((result, i) => {
          if (result.status !== "fulfilled") return;
          const { data, ...meta } = result.value;
          fetchedAt = Math.max(fetchedAt, meta.fetchedAt);
          stale = stale || meta.stale;
          // One report per response, but it is keyed by ITS date, not
          // necessarily the one we asked for — read the entry rather
          // than indexing by our own string.
          const report = Object.values(data.reports)[0];
          const totals = report?.totals;
          if (!totals) return;
          points.push({
            date: dates[i],
            volume: totals.volume,
            trades: totals.trades,
          });
        });

        return { data: points, fetchedAt, stale };
      },
      [days],
    ),
  );
}
