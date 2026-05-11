import {
  PATCH_FRUIT,
  PATCH_FRUIT_SEEDS,
  batchPatchFruitYields,
  getItemIcon,
  type FruitPatch,
  type GameState,
  type PatchFruitName,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// Batched yield prediction — see src/game/batch-yields.ts.
//
// readyAt mirrors fruitPatchReadiness.ts: subsequent harvest cycles
// tick from `harvestedAt`, the initial grow from `plantedAt`.

export function extractFruitTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const patches = state.fruitPatches ?? {};

  type Row = {
    patchId: string;
    patch: FruitPatch;
    fruitName: PatchFruitName;
    readyAt: number;
  };
  const rows: Row[] = [];
  for (const [patchId, patch] of Object.entries(patches)) {
    const fruit = patch.fruit;
    if (!fruit || fruit.harvestsLeft <= 0) continue;
    const seedName = PATCH_FRUIT[fruit.name]?.seed;
    const grow = seedName ? PATCH_FRUIT_SEEDS[seedName]?.plantSeconds : 0;
    if (!grow) continue;
    const baseAt = fruit.harvestedAt > 0 ? fruit.harvestedAt : fruit.plantedAt;
    rows.push({
      patchId,
      patch,
      fruitName: fruit.name,
      readyAt: baseAt + grow * 1000,
    });
  }

  const byName = new Map<PatchFruitName, Row[]>();
  for (const row of rows) {
    const list = byName.get(row.fruitName) ?? [];
    list.push(row);
    byName.set(row.fruitName, list);
  }
  for (const list of byName.values()) {
    list.sort((a, b) => a.readyAt - b.readyAt);
  }

  const out: Timer[] = [];
  for (const [fruitName, group] of byName) {
    const yields = batchPatchFruitYields({
      game: state,
      fruitName,
      patches: group.map(({ patchId, patch }) => ({ patchId, patch })),
      farmId: ctx.farmId,
    });
    for (const { patchId, readyAt } of group) {
      const entry = yields.get(patchId);
      const amount = entry?.amount ?? 1;
      out.push({
        id: `fruit:${patchId}`,
        category: "Fruit Patches",
        label: fruitName,
        icon: getItemIcon(fruitName),
        readyAt,
        predictedYield: { amount, item: fruitName },
        boosts: entry?.boosts,
        aggregationKey: `Fruit Patches|${fruitName}`,
      });
    }
  }

  return out;
}
