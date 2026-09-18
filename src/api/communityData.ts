import type {
  Auction,
  CollectionName,
  TradeListing,
  TradeOffer,
} from "../game/index.ts";
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
 * One item's OPEN market as of the last time upstream rebuilt the
 * report (about once a minute). Unlike `items`, this covers every item
 * with live trades — including ones that haven't sold today — so an
 * item can appear here with no `MarketplaceItemStats` at all.
 *
 * On a past day's report it is the market as that day ended, and it is
 * absent entirely on reports written before upstream added the field.
 */
export type MarketplaceItemMarket = {
  /** Cheapest active listing, per unit. Absent when nothing is listed. */
  floor?: number;
  listingCount: number;
  offerCount: number;
  /** Highest active offer, per unit. Absent when there are no offers. */
  bestOffer?: number;
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
      market?: Record<string, MarketplaceItemMarket>;
    }
  >;
};

/** One party to a trade, as upstream resolves it for display. */
export type TradeParty = {
  id: number;
  username?: string;
  bumpkinUri?: string;
};

/**
 * One fulfilled trade. `initiatedBy` is whoever posted the trade and
 * `fulfilledBy` whoever took it; `source` says which side it started
 * from, which is what decides whether the profile's owner was buying or
 * selling (see `tradeDirection` in the marketplace page).
 */
export type MarketplaceSale = {
  id: string;
  sfl: number;
  quantity: number;
  itemId: number;
  collection: CollectionName;
  fulfilledAt: number;
  fulfilledBy: TradeParty;
  initiatedBy: TradeParty;
  source: "offer" | "listing";
};

/**
 * `type=marketplaceProfile` — one farm's marketplace standing. Upstream
 * strips the on-chain `signature` off every open trade before it
 * publishes them, hence the `Omit`.
 *
 * Farm-scoped, so the Worker runs the overview's access check before
 * serving it (worker/index.ts) even though upstream treats it as public.
 */
export type MarketplaceProfileData = {
  id: number;
  username: string;
  /** Within-ascension level; meaningless without `ascension`. */
  level: number;
  ascension: number;
  tokenUri: string;
  totalTrades: number;
  /** Lifetime FLOWER profit. */
  profit: number;
  weeklyFlowerSpent: number;
  weeklyFlowerEarned: number;
  listings: Record<string, Omit<TradeListing, "signature">>;
  offers: Record<string, Omit<TradeOffer, "signature">>;
  /** Top 5 most frequent counterparties, busiest first. */
  friends: Array<{
    id: number;
    tokenUri: string;
    username: string;
    trades: number;
  }>;
  /** The farm's last fifty trades, newest first. */
  trades: MarketplaceSale[];
};

/** One day in an item's sale history. */
export type TradeHistoryDate = {
  date: string;
  low: number;
  high: number;
  volume: number;
  sales: number;
};

/**
 * `type=tradeable` — the marketplace page for a single item: its floor,
 * last sale, supply, every open offer and listing, and seven days of
 * sale history.
 *
 * `offeredBy` / `listedBy` are resolved profiles upstream attaches to
 * each open trade. They're optional here because upstream's own `Offer`
 * / `Listing` types don't declare them — the handler casts the enriched
 * object — so we read them defensively rather than trusting the cast.
 */
export type TradeableData = {
  id: number;
  collection: CollectionName;
  floor: number;
  lastSalePrice: number;
  isActive: boolean;
  isVip: boolean;
  supply?: number;
  expiresAt?: number;
  offerCount: number;
  listingCount: number;
  offers: Array<{
    tradeId: string;
    sfl: number;
    quantity: number;
    offeredById: number;
    offeredAt: number;
    type: "onchain" | "instant";
    offeredBy?: TradeParty;
  }>;
  listings: Array<{
    id: string;
    sfl: number;
    quantity: number;
    listedById: number;
    listedAt: number;
    type: "onchain" | "instant";
    listedBy?: TradeParty;
  }>;
  history: {
    sales: MarketplaceSale[];
    history: {
      totalSales: number;
      totalVolume: number;
      dates: Record<string, TradeHistoryDate>;
      lastSale?: { sfl: number; soldAt: number };
    };
  };
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

/** One farm's marketplace profile. Access-gated in the Worker. */
export function fetchMarketplaceProfile(
  farmId: number,
  signal?: AbortSignal,
): Promise<Fetched<MarketplaceProfileData>> {
  return fetchData<MarketplaceProfileData>(
    "marketplaceProfile",
    { farmId: String(farmId) },
    signal,
  );
}

/** One item's marketplace page. */
export function fetchTradeable(
  collection: string,
  id: number,
  signal?: AbortSignal,
): Promise<Fetched<TradeableData>> {
  return fetchData<TradeableData>(
    "tradeable",
    { collection, id: String(id) },
    signal,
  );
}
