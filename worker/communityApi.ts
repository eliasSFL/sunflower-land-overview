// Wrappers around `api.sunflower-land.com` community endpoints. Phase 1
// only needs the single-farm GET (for the subscribe-time warm fetch);
// the paginated scan used by the Coordinator lands in Phase 2.

const UPSTREAM = "https://api.sunflower-land.com";

// Per-farm community key format (services/communityApiKey.ts on the backend):
//   payload   = base64url(farmId as string)
//   signature = base64url(HMAC-SHA256(masterSecret, payload))
//   key       = `sfl.${payload}.${signature}`
// `looksLikePerFarmKey` lets local dev work with a single farm's pre-minted
// key (no master secret on the laptop) while production uses the master.
const PER_FARM_KEY_RE = /^sfl\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function looksLikePerFarmKey(value: string): boolean {
  return PER_FARM_KEY_RE.test(value);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Mint a per-farm community API key from the master HMAC secret.
// If `masterSecret` is itself already a per-farm key (local-dev mode),
// return it unchanged — upstream will accept it for the encoded farm
// and reject it for any other.
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

export async function getFarm(
  farmId: number,
  apiKey: string,
  clientIp?: string,
): Promise<GetFarmResult> {
  const headers: Record<string, string> = { "x-api-key": apiKey };
  // The BE's `community-get-farm` throttle keys on `cf-connecting-ip`,
  // which from the Worker's outbound fetch resolves to a shared egress
  // IP — so back-to-back subscribes from different players blow the
  // bucket. Forward the eyeball's IP so the BE can scope the throttle
  // per-player when the API key validates. `x-forwarded-client-ip` is
  // a custom name so we don't collide with any CF-managed header.
  if (clientIp) headers["x-forwarded-client-ip"] = clientIp;

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
      res = await fetch(`${UPSTREAM}/community/farms/${farmId}`, { headers });
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
