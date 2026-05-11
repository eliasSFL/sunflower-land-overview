import {
  PATCH_FRUIT,
  PATCH_FRUIT_SEEDS,
  getItemIcon,
  getPatchFruitYield,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

export function extractFruitTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const patches = state.fruitPatches ?? {};
  const out: Timer[] = [];

  for (const [patchId, patch] of Object.entries(patches)) {
    const fruit = patch.fruit;
    if (!fruit) continue;
    // Fully-exhausted bushes need re-seeding; nothing to time.
    if (fruit.harvestsLeft <= 0) continue;

    // Fail closed on unknown fruit names. PATCH_FRUIT[name].seed →
    // PATCH_FRUIT_SEEDS[seed].plantSeconds — same lookup the harvest
    // readiness check does upstream (fruitPatchReadiness.ts:13).
    const seedName = PATCH_FRUIT[fruit.name]?.seed;
    const grow = seedName ? PATCH_FRUIT_SEEDS[seedName]?.plantSeconds : undefined;
    if (grow === undefined) {
      console.warn(
        `[fruits] unknown duration for "${fruit.name}" — skipping patch`,
      );
      continue;
    }
    // After the first harvest, the next-ready clock restarts from
    // `harvestedAt`; before any harvest it ticks from `plantedAt`.
    // (sunflower-land/src/features/game/events/landExpansion/fruitPatchReadiness.ts)
    const baseAt = fruit.harvestedAt > 0 ? fruit.harvestedAt : fruit.plantedAt;
    const readyAt = baseAt + grow * 1000;

    const counter = ctx.counter.next();
    let amount = 1;
    try {
      const result = getPatchFruitYield({
        name: fruit.name,
        game: state,
        fertiliser: patch.fertiliser?.name,
        prngArgs: { farmId: ctx.farmId, counter },
      });
      amount = result.amount;
    } catch {
      // Retain the initial `amount = 1` on upstream throw.
    }

    out.push({
      id: `fruit:${patchId}`,
      category: "Fruit Patches",
      label: fruit.name,
      icon: getItemIcon(fruit.name),
      readyAt,
      predictedYield: { amount, item: fruit.name },
      aggregationKey: `Fruit Patches|${fruit.name}`,
    });
  }

  return out;
}
