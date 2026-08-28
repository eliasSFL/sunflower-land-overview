// Wrappers around `api.sunflower-land.com` community endpoints: the
// service key every call is made with, and the single-farm GET used by
// the access gate and the DO's warm fetch. The `/community/data` reader
// lives next door in worker/communityData.ts.

// Default upstream when `env.SFL_API_URL` is unset (production). Any
// caller that has the Worker `Env` should resolve the base via
// `upstreamBase(env)` so a personal SST stage can be targeted; this
// constant is only the fallback and the default for `getFarm`.
export const DEFAULT_UPSTREAM = "https://api.sunflower-land.com";

/**
 * Resolve the API base URL the Worker should hit. Returns
 * `env.SFL_API_URL` when set (a personal SST stage like `api-<stage>`),
 * else {@link DEFAULT_UPSTREAM} (production). Mirrors the game client's
 * `VITE_API_URL` override. A trailing slash is trimmed so callers can
 * always append `/community/...` cleanly.
 */
export function upstreamBase(env: { SFL_API_URL?: string }): string {
  const url = env.SFL_API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : DEFAULT_UPSTREAM;
}

// Community key format (services/communityApiKey.ts on the backend):
//   payload   = base64url(farmId as string)
//   signature = base64url(HMAC-SHA256(masterSecret, payload))
//   key       = `sfl.${payload}.${signature}`
const COMMUNITY_KEY_RE = /^sfl\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * True when `value` has the `sfl.{payload}.{sig}` community-key shape.
 * A cheap local sanity check only — it proves nothing about the
 * signature or the owning farm's standing, both of which only upstream
 * can judge.
 */
export function isCommunityKey(value: string): boolean {
  return COMMUNITY_KEY_RE.test(value);
}

/**
 * The single community API key every upstream call is made with.
 *
 * The overview used to mint a fresh key per *viewed* farm from the
 * master HMAC secret. That is no longer viable: upstream's
 * `verifyCommunityKey` now decodes the key to a farm id, loads that
 * farm, and rejects the key unless that farm holds VIP **and** total
 * Bumpkin level 50+ — re-checked on every request. Minting per viewed
 * farm would therefore 401 for essentially every ordinary player.
 *
 * So the key is now a service credential: one key, issued at
 * https://sunflower-land.com/community-docs to a farm that meets the
 * requirement, used for every farm we read. It is a bearer token, so
 * it stays server-side — the browser never sees it.
 *
 * Returns null (and logs) when unset or malformed, which callers turn
 * into a 503. Note the operational consequence: if the owning farm's
 * VIP lapses or it otherwise stops qualifying, upstream starts
 * returning 401 for *every* farm and the overview goes dark until the
 * key is renewed. `getFarm` reports that as `unauthorized` rather than
 * `not_found` so it can't be mistaken for "this farm doesn't exist".
 */
export function serviceKey(env: {
  SFL_COMMUNITY_API_KEY?: string;
}): string | null {
  const key = env.SFL_COMMUNITY_API_KEY?.trim();
  if (!key) return null;
  if (!isCommunityKey(key)) {
    console.error(
      "SFL_COMMUNITY_API_KEY is not a community key (expected `sfl.{payload}.{sig}`) — " +
        "issue one at https://sunflower-land.com/community-docs",
    );
    return null;
  }
  return key;
}

export type FarmResponseRaw = {
  farm: unknown;
  id: number;
  nft_id?: number;
  nftId?: number;
  isBlacklisted?: boolean;
};

// Discriminated result. The subscribe path needs to distinguish
// "farm does not exist" from "upstream temporarily unhappy" so that
// we only persist opt-in for farms that really exist.
//
// BE behaviour ([api/community/getFarm.ts](../sunflower-land/sunflower-land-api/src/api/community/getFarm.ts)):
//   200 → exists (blacklisted included, flagged in payload)
//   404 → invalid format or farm not found
//   401 → our service key was rejected. Since the key is a single
//         credential shared by every request, this is never about the
//         farm being asked for — it means the key is missing, revoked,
//         or its owning farm no longer meets upstream's VIP + level 50
//         requirement. Reported as `unauthorized`, deliberately NOT
//         `not_found`: conflating the two would tell every player
//         "farm not found" the moment our key lapsed, and would make
//         the subscribe path silently drop opt-ins.
//   429   → BE per-IP throttle on our egress IPs. Transient.
//   ≥500  → upstream error. Transient.
export type GetFarmResult =
  | { ok: true; raw: FarmResponseRaw }
  | {
      ok: false;
      reason:
        | "not_found"
        | "unauthorized"
        | "upstream_error"
        | "network"
        | "parse";
      status: number;
    };

// Retry profile for transient upstream failures. Backs off with jitter
// so a worker that hits a shared egress-IP throttle bucket doesn't
// stampede the BE on retry. Total worst-case wall time stays well under
// a Worker's subrequest budget so we don't risk a Worker timeout.
const RETRY_DELAYS_MS: ReadonlyArray<readonly [number, number]> = [
  [100, 250],
  [400, 800],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a single farm from upstream `community/farms/{id}`.
 *
 * Distinguishes "definitely not found" (404) from "our key was
 * rejected" (401) and from "transient upstream issue" (429/5xx/
 * network), so the subscribe path only persists opt-in for farms that
 * really exist. Transient failures are retried with jittered backoff
 * per {@link RETRY_DELAYS_MS}; 404 and 401 are not retried — both are
 * deterministic given the inputs.
 *
 * @param farmId    Numeric farm id to fetch.
 * @param apiKey    The service community key, from {@link serviceKey}.
 *                  Sent on `x-api-key` for `verifyCommunityKey` upstream.
 * @param clientIp  Eyeball's IP. Forwarded on `x-forwarded-client-ip` so
 *                  the BE's `community-get-farm` throttle scopes per
 *                  player when the trusted-proxy gate fires. Omit for
 *                  server-initiated calls (Coordinator sweep).
 * @param supportKey Admin secret proving the request is from our worker.
 *                   Sent on `x-support-key`; matches the BE's
 *                   `process.env.SUPPORT_API_KEY` to unlock per-player
 *                   throttling. When absent the BE falls back to
 *                   `cf-connecting-ip` (no behaviour change).
 * @param upstream  API base URL to hit. Defaults to {@link DEFAULT_UPSTREAM}
 *                  (production); callers with the Worker `Env` should pass
 *                  `upstreamBase(env)` to honour an `SFL_API_URL` override.
 */
export async function getFarm(
  farmId: number,
  apiKey: string,
  clientIp?: string,
  supportKey?: string,
  upstream: string = DEFAULT_UPSTREAM,
): Promise<GetFarmResult> {
  const headers: Record<string, string> = { "x-api-key": apiKey };
  // The BE's `community-get-farm` throttle keys on `cf-connecting-ip`,
  // which from the Worker's outbound fetch resolves to a shared egress
  // IP — so back-to-back subscribes from different players blow the
  // bucket. Forward the eyeball's IP so the BE can scope the throttle
  // per-player when the API key validates. `x-forwarded-client-ip` is
  // a custom name so we don't collide with any CF-managed header.
  if (clientIp) headers["x-forwarded-client-ip"] = clientIp;
  // Admin secret that proves the request is from our trusted proxy.
  // The BE only trusts `x-forwarded-client-ip` for the throttle bucket
  // when this matches `process.env.SUPPORT_API_KEY` (timing-safe). When
  // absent the BE silently falls back to `cf-connecting-ip`.
  if (supportKey) headers["x-support-key"] = supportKey;

  // 1 try + RETRY_DELAYS_MS.length retries on 429/5xx/network.
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  let lastTransient: GetFarmResult = {
    ok: false,
    reason: "network",
    status: 0,
  };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${upstream}/community/farms/${farmId}`, { headers });
    } catch {
      lastTransient = { ok: false, reason: "network", status: 0 };
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay) await sleep(jitter(delay[0], delay[1]));
      continue;
    }
    if (res.status === 404) {
      return { ok: false, reason: "not_found", status: res.status };
    }
    if (res.status === 401) {
      console.error(
        `community key rejected by upstream (401) — the key's farm likely no longer ` +
          `has VIP + level 50. Renew at https://sunflower-land.com/community-docs`,
      );
      return { ok: false, reason: "unauthorized", status: res.status };
    }
    if (res.status === 429 || res.status >= 500) {
      lastTransient = {
        ok: false,
        reason: "upstream_error",
        status: res.status,
      };
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay) await sleep(jitter(delay[0], delay[1]));
      continue;
    }
    if (!res.ok) {
      return { ok: false, reason: "upstream_error", status: res.status };
    }
    try {
      const raw = (await res.json()) as FarmResponseRaw;
      return { ok: true, raw };
    } catch {
      return { ok: false, reason: "parse", status: res.status };
    }
  }
  return lastTransient;
}

function jitter(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}
