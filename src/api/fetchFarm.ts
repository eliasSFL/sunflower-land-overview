import { makeGame, type GameState } from "../game/index.ts";
import { postRefresh } from "../notifications/api.ts";
import { getExistingSubscription } from "../notifications/subscribe.ts";

export type FarmResponse = {
  farm: GameState;
  id: number;
  nft_id?: number;
  nftId?: number;
  isBlacklisted?: boolean;
  // ISO timestamp of the last real save on the BE (FarmModel.updatedAt;
  // bumped by addFarmDefaultValues + mongoDiff so it only moves when
  // the GameState actually changed). Optional because legacy cached
  // payloads from before the BE shipped this field on the single-farm
  // GET endpoint won't have it.
  updatedAt?: string;
};

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Thrown by `fetchFarm` / surfaced by `loadCachedFarm` (returns undefined)
// when the farm isn't in the current access cohort. Distinct from
// `ApiError` so callers can render a friendly "check back later" message
// instead of treating it as a network/server failure.
export class AccessDeniedError extends Error {
  constructor(message = "Farm is not on the access list yet") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

const FARM_CACHE_PREFIX = "sfl-overview:farm:";

const farmCacheKey = (farmId: string | number) =>
  `${FARM_CACHE_PREFIX}${String(farmId).trim()}`;

// Cache the *raw* server payload — `farm` here is plain JSON numbers,
// not the Decimal-hydrated form returned to callers. Hydrating in
// `loadCachedFarm` keeps `JSON.stringify` simple (Decimal instances
// don't round-trip).
function saveCachedFarm(farmId: string | number, raw: FarmResponse): void {
  try {
    localStorage.setItem(
      farmCacheKey(farmId),
      JSON.stringify({ v: raw, at: Date.now() }),
    );
  } catch {
    // Quota exceeded or storage disabled — ignore.
  }
}

export type CachedFarm = { data: FarmResponse; fetchedAt: number };

export function loadCachedFarm(
  farmId: string | number,
): CachedFarm | undefined {
  try {
    const raw = localStorage.getItem(farmCacheKey(farmId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { v: FarmResponse; at: number };
    if (!parsed?.v?.farm) return undefined;
    const data = { ...parsed.v, farm: makeGame(parsed.v.farm) };

    return { data, fetchedAt: parsed.at };
  } catch {
    return undefined;
  }
}

export async function fetchFarm(farmId: string): Promise<FarmResponse> {
  // Local-only mode: serve the rebased static snapshot instead of hitting
  // the Worker, so `npm run dev` works with no `wrangler dev`. Returns
  // before the network call, the localStorage cache write, and the DO
  // refresh ping — none of which make sense (or have a backend) offline.
  // The requested `farmId` is ignored; the snapshot carries its own id.
  //
  // The condition is the raw `import.meta.env` literal (not the
  // `IS_OFFLINE_FARM` flag) and the snapshot module is dynamically
  // imported, so when the flag is unset the bundler folds this to `false`
  // and drops the branch — keeping the ~240 KB fixture out of production.
  if (import.meta.env.VITE_OFFLINE_FARM === "true") {
    const { loadOfflineFarm } = await import("./offlineFarmData.ts");
    return loadOfflineFarm(Date.now());
  }

  const trimmedId = farmId.trim();
  if (!/^\d+$/.test(trimmedId)) {
    throw new ApiError(400, "Farm ID must be a number");
  }

  const res = await fetch(`/api/farms/${trimmedId}`);

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      message = String((parsed as Record<string, unknown>).error);
    } else if (typeof parsed === "string" && parsed.length > 0) {
      message = parsed;
    }
    // Worker enforces the cohort gate too — surfaces denial as 403
    // with `error: "access_denied"`. Re-throw as the dedicated error
    // so the UI's denial branch fires instead of a generic message.
    if (res.status === 403 && message === "access_denied") {
      throw new AccessDeniedError();
    }
    throw new ApiError(res.status, message, parsed);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("farm" in parsed) ||
    typeof (parsed as Record<string, unknown>).farm !== "object"
  ) {
    throw new ApiError(
      502,
      "Unexpected response shape from /api/farms",
      parsed,
    );
  }

  // Hydrate the inventory / balance / stock fields into Decimal
  // instances. Upstream helpers (animal boost gates, etc.) call `.gt(0)`
  // / `.add()` on these — they'd crash on the raw JSON numbers.
  const raw = parsed as FarmResponse;
  const hydrated = { ...raw, farm: makeGame(raw.farm) };

  saveCachedFarm(trimmedId, raw);

  // Best-effort ping so the DO catches up immediately instead of
  // waiting for the next coordinator sweep. Swallow errors — the
  // sweep is the safety net.
  //
  // /push/refresh now requires the caller's subscription endpoint
  // (ownership proof against drive-by upstream amplification). When
  // no subscription exists there's nothing to refresh anyway — no DO
  // is scheduling pushes for this device.
  //
  // Forward the raw body we just received so the DO can apply it
  // directly — no second upstream fetch, no per-IP throttle pressure,
  // and crucially no 30s short-circuit window during which a
  // refresh on another device leaves this DO snapshot stale. Cross-
  // device sync via /push/state then always sees fresh data.
  if (typeof raw.id === "number") {
    const farmId = raw.id;
    void getExistingSubscription()
      .then((sub) => {
        if (sub)
          void postRefresh({ farmId, endpoint: sub.endpoint, snapshot: text });
      })
      .catch(() => {});
  }

  return hydrated;
}
