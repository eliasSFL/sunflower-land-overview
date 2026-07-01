// Wrappers around `api.sunflower-land.com` community endpoints. Phase 1
// only needs the single-farm GET (for the subscribe-time warm fetch);
// the paginated scan used by the Coordinator lands in Phase 2.

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

// Per-farm community key format (services/communityApiKey.ts on the backend):
//   payload   = base64url(farmId as string)
//   signature = base64url(HMAC-SHA256(masterSecret, payload))
//   key       = `sfl.${payload}.${signature}`
// `looksLikePerFarmKey` lets local dev work with a single farm's pre-minted
// key (no master secret on the laptop) while production uses the master.
const PER_FARM_KEY_RE = /^sfl\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * True when `value` matches the `sfl.{payload}.{sig}` per-farm key
 * shape. Used by {@link mintFarmKey} to decide whether the configured
 * secret is already a pre-minted per-farm key (local-dev mode) or a
 * master HMAC secret it should sign with.
 */
export function looksLikePerFarmKey(value: string): boolean {
  return PER_FARM_KEY_RE.test(value);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Mint a per-farm community API key from the master HMAC secret.
 *
 * If `masterSecret` is itself already a per-farm key (local-dev mode,
 * detected via {@link looksLikePerFarmKey}), it is returned unchanged
 * — upstream will accept it for the encoded farm and reject it for
 * any other. Otherwise, a fresh key is signed with HMAC-SHA256 and
 * the result follows the BE's `sfl.{base64url(farmId)}.{sig}` format.
 */
export async function mintFarmKey(
  farmId: number,
  masterSecret: string,
): Promise<string> {
  if (looksLikePerFarmKey(masterSecret)) {
    return masterSecret;
  }
  const payload = toBase64Url(new TextEncoder().encode(String(farmId)));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(payload),
  );
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `sfl.${payload}.${sigB64}`;
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
//   401 → API key rejected. The BE's [verifyCommunityKey](../sunflower-land/sunflower-land-api/src/services/communityApiKey.ts)
//         decodes the key payload to a farmId and loadFarm()'s it;
//         null farm ⇒ 401. Since we mint with a signature the BE will
//         accept, any 401 here is the encoded-farmId check failing —
//         treat as not_found.
//   429   → BE per-IP throttle on our egress IPs. Transient.
//   ≥500  → upstream error. Transient.
export type GetFarmResult =
  | { ok: true; raw: FarmResponseRaw }
  | {
      ok: false;
      reason: "not_found" | "upstream_error" | "network" | "parse";
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
 * Distinguishes "definitely not found" (404/401 — both deterministic
 * given a valid signed key) from "transient upstream issue" (429/5xx/
 * network) so the subscribe path only persists opt-in for farms that
 * really exist. Transient failures are retried with jittered backoff
 * per {@link RETRY_DELAYS_MS}.
 *
 * @param farmId    Numeric farm id to fetch.
 * @param apiKey    Per-farm community key, minted via {@link mintFarmKey}.
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

  // 1 try + RETRY_DELAYS_MS.length retries on 429/5xx/network. 404/401
  // and parse failures are not retried — they're deterministic given
  // the inputs.
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
    if (res.status === 404 || res.status === 401) {
      return { ok: false, reason: "not_found", status: res.status };
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
