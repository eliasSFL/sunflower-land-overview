import { getItemIcon, getPatchFruitYield } from "../game/index.ts";
import type { GameState } from "../game/index.ts";
import { PATCH_FRUIT_SECONDS } from "../lib/durations.ts";
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

    const grow = PATCH_FRUIT_SECONDS[fruit.name] ?? 0;
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
        fertiliser: patch.fertiliser?.name ?? fruit.fertiliser?.name,
        prngArgs: { farmId: ctx.farmId, counter },
      });
      amount = result.amount;
    } catch {
      amount = 1;
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
