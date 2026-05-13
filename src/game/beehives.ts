// Beehive bridge — re-exports the upstream helpers we use plus one
// narrowed wrapper for the harvest multiplier. The pure honey math lives
// in `features/game/lib/beehiveProduction` (no xstate at module top), so
// we import it from there directly.

export {
  getCurrentHoneyProduced,
  getCurrentSpeed,
} from "features/game/lib/beehiveProduction";
export { DEFAULT_HONEY_PRODUCTION_TIME } from "features/game/lib/updateBeehives";

import { updateBeehives as upstreamUpdateBeehives } from "features/game/lib/updateBeehives";
import { getHoneyMultiplier as upstreamGetHoneyMultiplier } from "features/game/events/landExpansion/harvestBeehive";

import type { Beehives, GameState } from "./types.ts";

// Narrowing wrapper — upstream `updateBeehives` infers an unknown
// return type (xstate ambient + Immer produce(). Same call, just typed.
export function refreshBeehives(args: {
  game: GameState;
  createdAt: number;
}): Beehives {
  return upstreamUpdateBeehives(args) as Beehives;
}

// Multiplier applied at harvest (Bee Suit, Honeycomb Shield, Sweet
// Bonus, King of Bears) — see harvestBeehive.ts:getHoneyMultiplier.
// Wrapper narrows the return shape from `{ multiplier, boostsUsed }` to
// a bare number — the boost list isn't used by callers.
export function getHoneyMultiplier(game: GameState): number {
  const result = upstreamGetHoneyMultiplier(game);
  return Number(result?.multiplier ?? 1);
}
