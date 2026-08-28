import type { Auction } from "../game/index.ts";
import { ApiError } from "./fetchFarm.ts";

// Readers for the Worker's `/api/data` route, which fronts upstream's
// `GET /community/data?type=…`. The Worker holds the API key and does
// the caching (worker/communityData.ts) — from here it is a plain
// public GET.
//
// Response bodies are upstream's verbatim `{ data: … }` envelope; the
// Worker hangs freshness on headers so the panels can render an
// "as of" without us reshaping the payload.

/** `type=auctions` — the full auction calendar plus per-item max supply. */
export type AuctionsData = {
  auctions: Auction[];
  totalSupply: Record<string, number>;
};

/** One item's trading stats for a single day. */
export type MarketplaceItemStats = {
  volume: number;
  trades: number;
  quantity: number;
  low?: number;
  high?: number;
  latestSale?: number;
};

/**
 * `type=marketplaceActivity` — one report per day, keyed `YYYY-MM-DD`.
 * `totals` is optional because upstream returns `report?.totals`, which
 * is undefined on a day the batch job hasn't written yet.
 */
export type MarketplaceActivityData = {
  flowerPrice: number;
  reports: Record<
    string,
    {
      totals?: { volume: number; trades: number };
      items: Record<string, MarketplaceItemStats>;
    }
  >;
};

export type Fetched<T> = {
  data: T;
  // When the Worker last got this from upstream (epoch ms). 0 when the
  // Worker didn't report one.
  fetchedAt: number;
  // True when upstream was unavailable and the Worker served its last
  // good copy instead. Panels surface this rather than hiding it.
  stale: boolean;
};

async function fetchData<T>(
  type: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<Fetched<T>> {
  const query = new URLSearchParams({ type, ...params });
  const res = await fetch(`/api/data?${query}`, { signal });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      message = String((parsed as Record<string, unknown>).error);
    }
    throw new ApiError(res.status, message, parsed);
  }

  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    throw new ApiError(502, "Unexpected response shape from /api/data", parsed);
  }

  return {
    data: (parsed as { data: T }).data,
    fetchedAt: Number(res.headers.get("x-data-fetched-at") ?? "0"),
    stale: res.headers.get("x-data-stale") === "1",
  };
}

export function fetchAuctions(
  signal?: AbortSignal,
): Promise<Fetched<AuctionsData>> {
  return fetchData<AuctionsData>("auctions", {}, signal);
}

/** Omit `date` for today's report. */
export function fetchMarketplaceActivity(
  date?: string,
  signal?: AbortSignal,
): Promise<Fetched<MarketplaceActivityData>> {
  return fetchData<MarketplaceActivityData>(
    "marketplaceActivity",
    date ? { date } : {},
    signal,
  );
}
