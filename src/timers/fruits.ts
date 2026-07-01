import {
  PATCH_FRUIT,
  PATCH_FRUIT_SEEDS,
  batchPatchFruitYields,
  getFruitReadyAt,
  getItemIcon,
  type FruitPatch,
  type GameState,
  type PatchFruitName,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// Batched yield prediction — see src/game/batch-yields.ts.
//
// readyAt is derived upstream by `getFruitReadyAt`: windowed
// (boost-accruing, incl. Turbofruit Mix fertiliser) when the fruit carries
// `baseDurationMs`, otherwise the legacy back-dated `harvestedAt` (or
// `plantedAt` for the initial grow) + base duration.

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
    rows.push({
      patchId,
      patch,
      fruitName: fruit.name,
      readyAt: getFruitReadyAt(fruit, state, patch.fertiliser),
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
    // Sum remaining harvests across every patch growing this fruit
    // so the aggregated card can surface "the tree(s) still have N
    // harvests before they're spent". Stamped on every per-patch
    // timer because the aggregator preserves the first source's
    // subtext via `...rest`; identical values per group make that
    // a no-op selection rather than an arbitrary one.
    const totalHarvestsLeft = group.reduce(
      (sum, { patch }) => sum + (patch.fruit?.harvestsLeft ?? 0),
      0,
    );
    const subtext =
      totalHarvestsLeft > 0
        ? `${totalHarvestsLeft} harvest${totalHarvestsLeft === 1 ? "" : "s"} left`
        : undefined;
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
        subtext,
        aggregationKey: `Fruit Patches|${fruitName}`,
      });
    }
  }

  return out;
}
