import { makeGame, type GameState } from "../game/index.ts";

export type FarmResponse = {
  farm: GameState;
  id: number;
  nft_id?: number;
  nftId?: number;
  isBlacklisted?: boolean;
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
    return {
      data: { ...parsed.v, farm: makeGame(parsed.v.farm) },
      fetchedAt: parsed.at,
    };
  } catch {
    return undefined;
  }
}

export async function fetchFarm(
  farmId: string,
  apiKey: string,
): Promise<FarmResponse> {
  const trimmedId = farmId.trim();
  if (!/^\d+$/.test(trimmedId)) {
    throw new ApiError(400, "Farm ID must be a number");
  }

  const res = await fetch(`/api/farms/${trimmedId}`, {
    headers: { "x-api-key": apiKey.trim() },
  });

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
    throw new ApiError(res.status, message, parsed);
  }

  // Minimal shape check — every downstream consumer assumes `farm` is
  // present and `id` is numeric. A malformed 200 response from a
  // misconfigured proxy would otherwise crash deeper in the pipeline.
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
  saveCachedFarm(trimmedId, raw);
  return { ...raw, farm: makeGame(raw.farm) };
}
