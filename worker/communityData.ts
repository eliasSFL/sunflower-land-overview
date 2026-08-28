/// <reference types="@cloudflare/workers-types" />

import { serviceKey, upstreamBase } from "./communityApi.ts";
import type { Env } from "./types.ts";

/**
 * Reader for upstream's `GET /community/data?type=…` — the generic
 * community data endpoint (api/community/data.ts on the backend).
 *
 * Everything here exists because of one upstream detail: that handler
 * throttles on `cf-connecting-ip` *directly*, unlike
 * `community/farms/{id}` which runs the `resolveThrottleIp` trusted-
 * proxy dance. There is no `x-forwarded-client-ip` path, so every
 * player's request arrives at the BE wearing the same Worker egress IP
 * and lands in one shared `community-data-{type}` bucket — 5 s between
 * accepted calls, globally, for the whole overview.
 *
 * So we never proxy straight through. Each (type, params) tuple is
 * cached in the colo's Cache API and refreshed at most once per
 * `softTtlMs`; a throttled or broken upstream serves the stale copy
 * rather than an error. None of this data is per-player, so a shared
 * cache is correct as well as necessary.
 */

// Kept deliberately narrow: only what a panel actually renders. Adding
// a type upstream already supports (raffles, ticketLeaderboard,
// discordAnnouncements, nightlyDump) is a one-entry change here plus a
// client-side reader.
type ParamName = "auctionId" | "date" | "collection" | "id";

type TypeSpec = {
  // Query params forwarded upstream, in this order. Anything not
  // listed is dropped — we never splice caller-controlled keys into
  // the upstream query string.
  params: readonly ParamName[];
  // Required params. A missing one is a 400 before we touch upstream.
  required?: readonly ParamName[];
  // How long a cached copy is served without revalidating.
  softTtlMs: number;
  // How long a copy is retained for use as a stale fallback.
  hardTtlS: number;
};

const DATA_TYPES = {
  // The auction calendar is authored data — it changes when a chapter
  // ships, not minute to minute.
  auctions: { params: [], softTtlMs: 10 * 60_000, hardTtlS: 24 * 3600 },
  // Fixed once an auction closes; `pending` until then.
  auctionResults: {
    params: ["auctionId"],
    required: ["auctionId"],
    softTtlMs: 5 * 60_000,
    hardTtlS: 24 * 3600,
  },
  // Rebuilt by a backend batch job, not on demand — a minutes-old copy
  // is what upstream would hand us anyway.
  marketplaceActivity: {
    params: ["date"],
    softTtlMs: 5 * 60_000,
    hardTtlS: 24 * 3600,
  },
  // Per-item marketplace page. No panel drills into this yet; it is
  // wired up so one can, without another round of worker changes.
  tradeable: {
    params: ["collection", "id"],
    required: ["collection", "id"],
    softTtlMs: 2 * 60_000,
    hardTtlS: 6 * 3600,
  },
} as const satisfies Record<string, TypeSpec>;

export type CommunityDataType = keyof typeof DATA_TYPES;

export function isCommunityDataType(v: string): v is CommunityDataType {
  return Object.prototype.hasOwnProperty.call(DATA_TYPES, v);
}

const COLLECTIONS = new Set(["collectibles", "wearables", "buds", "pets"]);

// Validate before forwarding. Upstream would reject bad input with a
// 400 anyway, but each rejected call still burns our single shared
// throttle slot — so bad input must never reach it.
function validate(
  name: ParamName,
  value: string,
): { ok: true } | { ok: false; error: string } {
  switch (name) {
    case "auctionId":
      return /^[A-Za-z0-9_-]{1,64}$/.test(value)
        ? { ok: true }
        : { ok: false, error: "Invalid auctionId" };
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? { ok: true }
        : { ok: false, error: "date must be YYYY-MM-DD" };
    case "collection":
      return COLLECTIONS.has(value)
        ? { ok: true }
        : { ok: false, error: "Invalid collection" };
    case "id":
      return /^\d{1,12}$/.test(value)
        ? { ok: true }
        : { ok: false, error: "Invalid id" };
  }
}

export type CommunityDataResult =
  | { ok: true; body: string; fetchedAt: number; stale: boolean }
  | { ok: false; status: number; error: string };

// Stamped on the cached response so we can age it ourselves. The Cache
// API's own `Age` header isn't reliable across colos, and we want a
// soft/hard split it doesn't express.
const FETCHED_AT_HEADER = "x-overview-fetched-at";

/**
 * Read one community data set, cached.
 *
 * `params` is the caller's raw query; only keys the type declares are
 * forwarded, and each is validated first. Returns the upstream body
 * verbatim (`{ data: … }`) so the client owns the shape.
 */
export async function fetchCommunityData(
  env: Env,
  type: CommunityDataType,
  params: URLSearchParams,
): Promise<CommunityDataResult> {
  const key = serviceKey(env);
  if (!key) return { ok: false, status: 503, error: "Server not configured" };

  const spec: TypeSpec = DATA_TYPES[type];

  const query = new URLSearchParams({ type });
  for (const name of spec.params) {
    const value = params.get(name);
    if (value === null || value === "") continue;
    const check = validate(name, value);
    if (!check.ok) return { ok: false, status: 400, error: check.error };
    query.set(name, value);
  }
  for (const name of spec.required ?? []) {
    if (!query.has(name)) {
      return { ok: false, status: 400, error: `Missing ${name}` };
    }
  }

  // Cache key is a synthetic URL, not the upstream one: it must not
  // carry the API key and must stay stable if the upstream base
  // changes. `query` is built in the spec's declared order, so
  // equivalent requests share one entry regardless of caller ordering.
  const cacheKey = new Request(
    `https://community-data.sfl-overview.internal/?${query.toString()}`,
    { method: "GET" },
  );
  // tsconfig.node.json compiles worker/* with `lib: ["ES2023", "DOM"]`,
  // so the DOM's `CacheStorage` (which has no `default`) shadows the
  // Workers one that does. The binding is there at runtime; narrow it
  // here rather than widening the lib for every worker file.
  const cache = (caches as unknown as { default: Cache }).default;

  let cached: Response | undefined;
  try {
    cached = await cache.match(cacheKey);
  } catch {
    cached = undefined;
  }

  if (cached) {
    const fetchedAt = Number(cached.headers.get(FETCHED_AT_HEADER) ?? "0");
    if (fetchedAt && Date.now() - fetchedAt < spec.softTtlMs) {
      return {
        ok: true,
        body: await cached.text(),
        fetchedAt,
        stale: false,
      };
    }
  }

  const fresh = await fetchUpstream(env, key, query);

  if (fresh.ok) {
    const fetchedAt = Date.now();
    // Cache a copy; the caller gets the body we already read. Failing
    // to cache is survivable — worst case the next request refetches.
    try {
      await cache.put(
        cacheKey,
        new Response(fresh.body, {
          headers: {
            "content-type": "application/json",
            "cache-control": `public, max-age=${spec.hardTtlS}`,
            [FETCHED_AT_HEADER]: String(fetchedAt),
          },
        }),
      );
    } catch {
      // Ignore — cache is an optimisation here, not correctness.
    }
    return { ok: true, body: fresh.body, fetchedAt, stale: false };
  }

  // Upstream is unhappy (throttled, down, key rejected). A stale copy
  // beats an error for data this slow-moving — the panel renders with
  // an "as of" timestamp, so a stale read is visible rather than a lie.
  if (cached) {
    return {
      ok: true,
      body: await cached.text(),
      fetchedAt: Number(cached.headers.get(FETCHED_AT_HEADER) ?? "0"),
      stale: true,
    };
  }

  return fresh;
}

async function fetchUpstream(
  env: Env,
  key: string,
  query: URLSearchParams,
): Promise<
  { ok: true; body: string } | { ok: false; status: number; error: string }
> {
  let res: Response;
  try {
    res = await fetch(`${upstreamBase(env)}/community/data?${query}`, {
      headers: { "x-api-key": key },
    });
  } catch (err) {
    console.error("community/data fetch failed", {
      type: query.get("type"),
      err,
    });
    return { ok: false, status: 502, error: "Bad Gateway" };
  }

  console.log("community/data upstream", {
    type: query.get("type"),
    status: res.status,
  });

  if (res.status === 401) {
    console.error(
      "community key rejected by upstream (401) on /community/data — renew it " +
        "at https://sunflower-land.com/community-docs",
    );
    return {
      ok: false,
      status: 503,
      error: "Overview API key is not currently valid",
    };
  }
  if (res.status === 404) {
    return { ok: false, status: 404, error: "Not found" };
  }
  if (!res.ok) {
    // 429 included: our shared bucket is spent. Caller falls back to
    // the stale copy when it has one.
    return { ok: false, status: 502, error: `Upstream ${res.status}` };
  }

  return { ok: true, body: await res.text() };
}
