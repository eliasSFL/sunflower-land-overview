import { listOptedInIds, markSynced } from "./registry.ts";
import { mintFarmKey } from "./communityApi.ts";
import type { Env } from "./types.ts";

const UPSTREAM = "https://api.sunflower-land.com";
// Backend caps each paginated response at ~5.5 MB. Farms vary
// ~20–250 KB each, so a generous page size blows the cap and the
// backend returns 500. 50 farms × ~100 KB avg = ~5 MB, well under
// the limit while still keeping the sweep fast (~800 calls for 40k
// farms instead of ~80).
const PAGE_SIZE = 50;
const MAX_BACKOFF_MS = 60_000;
// Throttle the sweep against upstream — at 0ms we get ~19s/page from
// rate-limited IPs; small fixed delay keeps each page snappy and stays
// under the backend's 5s baseline-IP-throttle window.
const PER_PAGE_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ScanBody = {
  farms: Record<string, { id: number } & Record<string, unknown>>;
  next_cursor?: string;
};

// Upstream may signal "back off" via 429 (explicit rate limit) or 5xx
// (overloaded). Both are retryable from our perspective; only 4xx
// other than 429 are terminal.
type ScanResult =
  | { ok: true; body: ScanBody }
  | { ok: false; retryable: true; status: number }
  | { ok: false; retryable: false; status: number };

async function scanFarmsPage(
  cursor: string | undefined,
  limit: number,
  apiKey: string,
): Promise<ScanResult> {
  const u = new URL(`${UPSTREAM}/community/farms`);
  u.searchParams.set("limit", String(limit));
  if (cursor) u.searchParams.set("cursor", cursor);
  let res: Response;
  try {
    res = await fetch(u, { headers: { "x-api-key": apiKey } });
  } catch {
    // Network failure — treat as retryable; could be a transient
    // egress issue or upstream restart.
    return { ok: false, retryable: true, status: 0 };
  }
  if (!res.ok) {
    // 429 + 5xx = backend asking us to slow down or itself overloaded.
    // Both retry. 4xx (other than 429) = a real bug; abort the sweep.
    const retryable = res.status === 429 || res.status >= 500;
    const text = await res.text().catch(() => "");
    console.warn(
      `coordinator: upstream ${res.status} for /community/farms?limit=${limit}` +
        (cursor ? `&cursor=${cursor}` : "") +
        ` :: ${text.slice(0, 300)}`,
    );
    return { ok: false, retryable, status: res.status };
  }
  try {
    const body = (await res.json()) as ScanBody;
    return { ok: true, body };
  } catch {
    return { ok: false, retryable: false, status: 0 };
  }
}

// Runs from the Worker's `scheduled()` handler every 10 min.
//   1. Build the opt-in filter set from D1.
//   2. Walk paginated /community/farms, page size 500.
//   3. Filter each page to opted-in farms; fan-out to each DO.
//   4. Mark synced farms with the sweep's start timestamp.
export async function sweep(env: Env): Promise<void> {
  const startedAt = Date.now();

  if (!env.SFL_COMMUNITY_API_KEY) {
    console.warn("coordinator: SFL_COMMUNITY_API_KEY missing; skipping sweep");
    return;
  }

  const optedIn = new Set<number>(await listOptedInIds(env));
  if (optedIn.size === 0) return;

  // Mint a key once per sweep. The coordinator key is per-farm in
  // shape but the master secret is what's authoritative here — when
  // the env value is already a per-farm key (local dev), mintFarmKey
  // passes it through, which means we can only scan the encoded farm.
  // That's fine for local dev; prod uses the master secret and scans
  // everything.
  const scanKey = await mintFarmKey(0, env.SFL_COMMUNITY_API_KEY);

  let cursor: string | undefined;
  let totalScanned = 0;
  let totalMatched = 0;
  const synced: number[] = [];
  let backoffMs = 0;

  // Loop budget: leave headroom before the next 10-min cron tick. Cap
  // at 25 min wall-clock per sweep.
  const deadline = startedAt + 25 * 60 * 1000;

  while (Date.now() < deadline) {
    // Pause between pages — combination of any active backoff and a
    // small fixed delay to stay under the backend's per-IP throttle
    // window even when we're not seeing errors.
    if (backoffMs > 0) await sleep(backoffMs);
    else if (cursor !== undefined) await sleep(PER_PAGE_DELAY_MS);

    const res = await scanFarmsPage(cursor, PAGE_SIZE, scanKey);
    if (!res.ok) {
      if (res.retryable) {
        backoffMs = Math.min(Math.max(backoffMs * 2, 2_000), MAX_BACKOFF_MS);
        continue;
      }
      // Permanent error or malformed response — abort the sweep; the
      // next cron tick retries from cursor=undefined.
      console.warn(
        `coordinator: page failed permanently with status ${res.status}`,
      );
      break;
    }
    backoffMs = 0;

    const { farms, next_cursor } = res.body;
    const entries = Object.entries(farms);
    totalScanned += entries.length;

    const matches = entries.filter(([id]) => optedIn.has(Number(id)));
    totalMatched += matches.length;

    await Promise.allSettled(
      matches.map(async ([id, raw]) => {
        const stub = env.FARM_PUSH_DO.get(
          env.FARM_PUSH_DO.idFromName(String(id)),
        );
        await stub.fetch("https://do/onSnapshot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(raw),
        });
      }),
    );
    synced.push(...matches.map(([id]) => Number(id)));

    if (!next_cursor) break;
    cursor = next_cursor;
  }

  if (synced.length > 0) {
    await markSynced(env, synced, startedAt).catch(() => {});
  }

  console.log(
    `coordinator: scanned=${totalScanned} matched=${totalMatched} ms=${Date.now() - startedAt}`,
  );
}
