import {
  getFlowerGrowSeconds,
  getFlowerYield,
  getItemIcon,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// Yield comes from the upstream `getFlowerAmount` (re-exported via
// src/game/flowers.ts) which reads `flower.criticalHit` populated
// server-side. readyAt mirrors harvestFlower.ts: speed boosts are baked
// into `plantedAt` at plant time, so the runtime check is just
// `now >= plantedAt + plantSeconds * 1000`.

export function extractFlowerTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const beds = state.flowers?.flowerBeds ?? {};
  const out: Timer[] = [];

  for (const [bedId, bed] of Object.entries(beds)) {
    const flower = bed.flower;
    if (!flower) continue;

    const grow = getFlowerGrowSeconds(flower.name);
    if (grow <= 0) {
      console.warn(
        `[flowers] unknown grow time for "${flower.name}" — skipping bed`,
      );
      continue;
    }

    // Advance the global PRNG counter so flowers participate in the
    // same sequence as other categories — keeps yields elsewhere stable
    // when flower beds are added or removed.
    ctx.counter.next();

    let amount = 1;
    try {
      amount = getFlowerYield(state, flower);
    } catch {
      // Retain the initial `amount = 1` on upstream throw.
    }
    const readyAt = flower.plantedAt + grow * 1000;

    out.push({
      id: `flower:${bedId}`,
      category: "Flowers",
      label: flower.name,
      icon: getItemIcon(flower.name),
      readyAt,
      predictedYield: { amount, item: flower.name },
      aggregationKey: `Flowers|${flower.name}`,
    });
  }

  return out;
}
