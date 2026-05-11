// Beehive deterministic-progression bridge.
//
// The API returns saved state — `hive.flowers[]` is whatever was attached
// at the last save, often all expired by now. The in-game UI runs
// `updateBeehives({ game, createdAt: now })` on every render to bake
// elapsed honey into `hive.honey.produced`, drop expired flowers, and
// re-attach flowers from currently-growing flower beds. We do the same
// here before reading any per-hive values.
//
// `getCurrentHoneyProduced` / `getCurrentSpeed` are simple math over
// `hive.flowers[]`; the upstream colocates them with an xstate machine
// (stubbed), so we mirror them inline. Logic identical to
// sunflower-land/src/features/game/expansion/components/resources/
// beehive/beehiveMachine.ts.

import { DEFAULT_HONEY_PRODUCTION_TIME as UPSTREAM_DEFAULT } from "features/game/lib/updateBeehives";
import { updateBeehives as upstreamUpdateBeehives } from "features/game/lib/updateBeehives";
import { getHoneyMultiplier as upstreamGetHoneyMultiplier } from "features/game/events/landExpansion/harvestBeehive";

import type { Beehive, Beehives, GameState } from "./types.ts";

// Number of honey-units a hive produces from empty to full (24h with a
// single 1.0-rate flower attached the whole time).
export const DEFAULT_HONEY_PRODUCTION_TIME: number = Number(
  UPSTREAM_DEFAULT ?? 24 * 60 * 60 * 1000,
);

// Refresh all beehives by running the same `updateBeehives` the game
// runs on every render. Returns a new Beehives map with elapsed honey
// baked into `honey.produced`, expired flowers dropped, and currently
// growing flower beds re-attached.
export function refreshBeehives(
  game: GameState,
  createdAt: number,
): Beehives {
  const result = upstreamUpdateBeehives({ game, createdAt });
  return (result ?? {}) as Beehives;
}

export function getCurrentHoneyProduced(hive: Beehive, now: number): number {
  const flowers = hive.flowers
    .slice()
    .sort((a, b) => a.attachedAt - b.attachedAt);

  return flowers.reduce((produced, flower) => {
    const start = Math.max(hive.honey.updatedAt, flower.attachedAt);
    const end = Math.min(now, flower.attachedUntil);
    const honey = Math.max(end - start, 0) * (flower.rate ?? 1);
    return produced + honey;
  }, hive.honey.produced);
}

export function getCurrentSpeed(hive: Beehive, now: number): number {
  return hive.flowers.reduce((rate, flower) => {
    if (flower.attachedUntil <= now || flower.attachedAt > now) return rate;
    return rate + (flower.rate ?? 1);
  }, 0);
}

// Multiplier applied at harvest (Bee Suit, Honeycomb Shield, Sweet
// Bonus, King of Bears) — see harvestBeehive.ts:getHoneyMultiplier.
export function getHoneyMultiplier(game: GameState): number {
  const result = upstreamGetHoneyMultiplier(game);
  return Number(result?.multiplier ?? 1);
}
