/// <reference types="@cloudflare/workers-types" />

// Widget feed — the compact, pre-computed "what's ready / what's next"
// list behind GET /api/widget/{farmId}.
//
// A native home-screen widget cannot run the timer extractors: they are
// TypeScript that calls straight into the `sunflower-land` submodule, and
// re-implementing that math on the device is exactly what the "never
// replicate" rule forbids. So the Worker does the extraction and hands
// the widget a flat list of absolute `readyAt` timestamps. The device
// only ever compares those against its own clock — which also means the
// widget keeps counting down correctly between fetches.
//
// The list is the Now page's own roll-up (`collectReady` +
// `upcomingWithin` from src/timers/nowFeed.ts), so a widget and the
// dashboard can never disagree about what counts as a collectable.

import { fetchAndCheckAccess } from "./access.ts";
import { makeGame } from "../src/game/index.ts";
import { extractAndAggregate } from "../src/timers/index.ts";
import {
  collectReady,
  upcomingWithin,
  type FeedItem,
} from "../src/timers/nowFeed.ts";
import type { AggregatedTimer } from "../src/timers/types.ts";
import type { Env } from "./types.ts";

// Bumped when a field changes meaning or is removed. Adding an optional
// field is not a version bump — installed widgets must ignore unknown
// keys, because an APK in the wild can lag the Worker by months.
export const WIDGET_FEED_VERSION = 1;

// A widget shows a handful of rows; 50 leaves room for a tall resizable
// layout and an exact "N ready" headline on all but the largest farms,
// while keeping the body to a few KB. `total` reports the uncapped count
// so a client can render "50+" instead of a wrong number.
export const MAX_WIDGET_ITEMS = 50;

// How old a Durable Object snapshot may be and still back a feed. The
// coordinator re-stamps every opted-in farm each 10 minutes, so anything
// older than this belongs to a farm that has since opted out (cleanup
// leaves the last snapshot in place) — fall through to a real,
// access-gated upstream read instead of serving it forever.
export const WIDGET_SNAPSHOT_MAX_AGE_MS = 15 * 60_000;

// How long a computed feed is reused per farm. This is what bounds the
// upstream cost of an unauthenticated route: however many widgets (or
// scripts) ask, a farm costs at most one upstream read per window per
// colo. A widget refreshes every 15+ minutes, so legitimate use rarely
// even hits it.
const WIDGET_FEED_TTL_S = 5 * 60;

export type WidgetItem = {
  // Stable per source across fetches — lets a client diff two feeds.
  key: string;
  label: string;
  category: string;
  amount: number;
  // ms since epoch. `<= now` means collectable right now.
  readyAt: number;
  // Always an absolute http(s) URL when present.
  icon?: string;
};

export type WidgetFeed = {
  v: typeof WIDGET_FEED_VERSION;
  farmId: number;
  // When the farm state behind this feed was read from upstream — the
  // widget's "as of" time. NOT when the feed was served; the response's
  // `x-server-time` header carries that, for clock-skew correction.
  fetchedAt: number;
  // Item count before the MAX_WIDGET_ITEMS cap.
  total: number;
  // Collectable-now items first (dashboard category order), then
  // upcoming items soonest-first.
  items: WidgetItem[];
};

export type WidgetFeedSource = "cache" | "snapshot" | "upstream";

export type WidgetFeedResult =
  | { ok: true; body: string; source: WidgetFeedSource }
  | { ok: false; status: number; error: string };

type FeedMeta = {
  farmId: number;
  fetchedAt: number;
  now: number;
  // Origin the request came in on. Icons bundled with the overview are
  // root-relative (`/icons/…`); a widget has no page to resolve them
  // against, so they are made absolute here.
  origin: string;
};

// Trim float noise ("4.800000000002") without changing the value a
// player would read.
function roundAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

function absoluteIcon(
  icon: string | undefined,
  origin: string,
): string | undefined {
  if (!icon) return undefined;
  try {
    const url = new URL(icon, origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function toItem(item: FeedItem, origin: string): WidgetItem {
  return {
    key: item.key,
    label: item.label,
    category: item.category,
    amount: roundAmount(item.amount),
    readyAt: item.readyAt,
    icon: absoluteIcon(item.icon, origin),
  };
}

// Pure: aggregated timers in, wire feed out. Split from
// `buildWidgetFeed` so it is testable without the game module.
export function toWidgetFeed(
  timers: AggregatedTimer[],
  meta: FeedMeta,
): WidgetFeed {
  // Same filter the dashboard applies (src/app/App.tsx): `pushOnly`
  // timers exist to drive a notification, not to be shown.
  const visible = timers.filter((t) => !t.pushOnly);
  const ready = collectReady(visible, meta.now).groups.flatMap((g) => g.items);
  const upcoming = upcomingWithin(visible, meta.now, Number.POSITIVE_INFINITY);
  const all = [...ready, ...upcoming];
  return {
    v: WIDGET_FEED_VERSION,
    farmId: meta.farmId,
    fetchedAt: meta.fetchedAt,
    total: all.length,
    items: all
      .slice(0, MAX_WIDGET_ITEMS)
      .map((item) => toItem(item, meta.origin)),
  };
}

// Hydrate a raw upstream `farm` payload, run the extractors, and shape
// the feed. Shared by the Durable Object (from its stored snapshot) and
// the upstream fallback below. Throws if the payload can't be extracted.
export function buildWidgetFeed(farm: unknown, meta: FeedMeta): WidgetFeed {
  const hydrated = makeGame(farm as Parameters<typeof makeGame>[0]);
  return toWidgetFeed(
    extractAndAggregate(hydrated, meta.farmId, meta.now),
    meta,
  );
}

// Ask the farm's Durable Object for a feed built from its snapshot.
// `null` means "nothing usable there" — no snapshot, a stale one, or the
// DO being unreachable — and the caller reads upstream instead.
async function fromSnapshot(
  env: Env,
  farmId: number,
  origin: string,
): Promise<string | null> {
  try {
    const stub = env.FARM_PUSH_DO.get(
      env.FARM_PUSH_DO.idFromName(String(farmId)),
    );
    const url = new URL("https://do/widget");
    url.searchParams.set("origin", origin);
    const res = await stub.fetch(url.toString());
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.error("widget feed: snapshot read failed", { farmId, err });
    return null;
  }
}

/**
 * Resolve the widget feed for a farm, cheapest source first:
 *
 *   1. The colo cache (a feed computed in the last few minutes).
 *   2. The farm's Durable Object snapshot, when the coordinator sweep is
 *      keeping it fresh — no upstream call at all.
 *   3. An access-gated upstream read (`fetchAndCheckAccess`, the same
 *      gate as `/api/farms/{id}`).
 *
 * A fresh DO snapshot stands in for the gate on path 2: it only exists
 * because upstream served that farm to us within the last
 * WIDGET_SNAPSHOT_MAX_AGE_MS.
 */
export async function fetchWidgetFeed(
  env: Env,
  farmId: number,
  opts: { origin: string; clientIp?: string },
): Promise<WidgetFeedResult> {
  // Synthetic key, like worker/communityData.ts. `origin` is part of it
  // because it is baked into the icon URLs in the body.
  const cacheKey = new Request(
    `https://widget-feed.sfl-overview.internal/${farmId}?origin=${encodeURIComponent(opts.origin)}`,
    { method: "GET" },
  );
  // See worker/communityData.ts for why this cast is needed.
  const cache = (caches as unknown as { default: Cache }).default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) return { ok: true, body: await cached.text(), source: "cache" };
  } catch {
    // Cache is an optimisation — carry on without it.
  }

  let body = await fromSnapshot(env, farmId, opts.origin);
  let source: WidgetFeedSource = "snapshot";

  if (body === null) {
    const access = await fetchAndCheckAccess(env, farmId, opts.clientIp);
    if (!access.ok) {
      return { ok: false, status: access.status, error: access.error };
    }
    try {
      const raw = JSON.parse(access.rawBody) as { farm: unknown };
      const now = Date.now();
      body = JSON.stringify(
        buildWidgetFeed(raw.farm, {
          farmId,
          fetchedAt: now,
          now,
          origin: opts.origin,
        }),
      );
      source = "upstream";
    } catch (err) {
      console.error("widget feed: extraction failed", { farmId, err });
      return { ok: false, status: 502, error: "Could not compute feed" };
    }
  }

  try {
    await cache.put(
      cacheKey,
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${WIDGET_FEED_TTL_S}`,
        },
      }),
    );
  } catch {
    // Ignore — worst case the next request recomputes.
  }

  return { ok: true, body, source };
}
