// Heavy half of the local-only dev mode: the captured farm snapshot and
// the timer-rebase logic. This module is imported ONLY via `await import()`
// from `fetchFarm`'s offline branch, which is guarded by a literal
// `import.meta.env.VITE_OFFLINE_FARM === "true"` check — so in production
// builds (flag unset) the branch is dead code and neither this module nor
// the ~240 KB snapshot it pulls in are emitted. See `offlineFarm.ts` for
// the flag.

import { makeGame } from "../game/index.ts";
import type { FarmResponse } from "./fetchFarm.ts";

// The snapshot is the raw API payload: inventory amounts are strings,
// `balance` is a string, timers are epoch-ms numbers — exactly what the
// live `/api/farms/:id` returns before `makeGame` hydrates the Decimals.
// `updatedAt` comes back as epoch ms here (the single-farm proxy types it
// as an ISO string), so accept both.
type RawSnapshot = FarmResponse & { updatedAt?: number | string };

// Game timestamps are `Date.now()` epoch-ms (~1.7e12). The other large
// numbers a farm carries all sit outside this window: the VIP `expiresAt`
// sentinel (~3.3e13) and the `winnerId` / `waves.farms` farm ids (~1e15)
// are above it, every amount / level / coordinate is far below it. So a
// magnitude window picks out exactly the timers without needing to know
// the GameState schema — which would rot the moment upstream adds a field.
const TS_LO = 1_600_000_000_000; // 2020-09-13
const TS_HI = 2_000_000_000_000; // 2033-05-18

// Returns a structurally-new copy of `value` with every epoch-ms timer
// shifted by `deltaMs`. Pure (never mutates the imported snapshot, so
// repeated loads stay correct) and schema-agnostic. Runs on the raw JSON
// before `makeGame`, so it never meets a Decimal — inventory/balance are
// still strings and skip the number branch. Exported for testing.
export function shiftTimers<T>(value: T, deltaMs: number): T {
  if (typeof value === "number") {
    return (value >= TS_LO && value < TS_HI ? value + deltaMs : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => shiftTimers(v, deltaMs)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = shiftTimers(v, deltaMs);
    }
    return out as T;
  }
  return value;
}

// `updatedAt` is the snapshot's "current moment" we rebase from. The
// community API returns it as epoch-ms — sometimes a number, sometimes a
// numeric string — while the single-farm proxy types it as an ISO string.
// Accept all three; fall back to `now` (no shift) if it's missing or
// unparseable so a bad anchor can never produce NaN timers.
function toEpochMs(value: number | string | undefined, fallback: number) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber; // epoch-ms string
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate; // ISO string
  }
  return fallback;
}

// Loads the snapshot, rebases its timers so it looks freshly captured at
// `now`, and hydrates it exactly like `fetchFarm` hydrates a live payload.
export async function loadOfflineFarm(now: number): Promise<FarmResponse> {
  const snapshot = (await import("./offlineFarm.snapshot.json"))
    .default as unknown as RawSnapshot;
  const delta = now - toEpochMs(snapshot.updatedAt, now);
  const farm = shiftTimers(snapshot.farm, delta);
  return {
    ...snapshot,
    farm: makeGame(farm),
    // Stamp "just saved now" so the header's last-saved label is sensible.
    updatedAt: new Date(now).toISOString(),
  };
}
