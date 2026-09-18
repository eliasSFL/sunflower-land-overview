import {
  getCropMachineBoostWindows,
  getCropMachinePackYield,
  getItemIcon,
  resolveCropMachine,
  type CropMachineBuilding,
  type CropName,
  type GameState,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// One Timer per pack (queue slot). Yield prediction threads a per-crop
// counter across packs so two consecutive Sunflower packs predict in the
// same PRNG sequence the game would use if you harvested them one after
// the other — see harvestCropMachine.ts:initialCounter.
//
// Ready times come from upstream's `resolveCropMachine`, NOT from each
// pack's stored `readyAt`. The machine moved onto the windowed
// speed-rate model in #7608: the Tortoise Shrine is a live 10/9x speed
// over the queue rather than a discount baked in at supply time, packs
// grow sequentially, and the tank drains with the wall clock while a
// pack grows — so a shrine placed mid-pack both pulls every pack behind
// it forward and stretches the fuel, and neither effect can be read off
// a stored timestamp. Upstream refreshes those stamps only when an event
// rewrites the queue; between writes this resolution is the source of
// truth. A legacy machine (no `oilSettledAt`) passes its stored values
// straight through the same call, so there is nothing to branch on.

export function extractCropMachineTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const machines = state.buildings?.["Crop Machine"] ?? [];
  if (machines.length === 0) return [];

  type PackEntry = {
    machineId: string;
    packIndex: number;
    pack: CropMachineBuilding["queue"] extends (infer T)[] | undefined
      ? T
      : never;
    readyAt: number;
  };

  const windows = getCropMachineBoostWindows(state);

  const entries: PackEntry[] = [];
  for (const [mIndex, machine] of machines.entries()) {
    const machineId = machine.id ?? `m${mIndex}`;
    const queue = machine.queue ?? [];
    // Per machine, not across all of them: each Crop Machine has its own
    // queue and its own tank, so the forward pass is machine-scoped.
    const { packs } = resolveCropMachine({ machine, windows });
    for (const [packIndex, pack] of queue.entries()) {
      // Skip packs that never finish on the fuel in the tank: a pack the
      // oil doesn't reach at all, and one that stalls part-way through
      // (`growsUntil` instead of `readyAt`), have no meaningful ready
      // time to count down to until the player tops the machine up.
      const readyAt = packs[packIndex]?.readyAt;
      if (!readyAt) continue;
      entries.push({
        machineId,
        packIndex,
        pack,
        readyAt,
      });
    }
  }

  // Process packs in the order the player would harvest them — the game
  // increments farmActivity[`{crop} Harvested`] each call, so an earlier
  // pack's seeds shift the PRNG counter for the next pack of the same
  // crop. readyAt-ascending matches the natural claim order.
  entries.sort((a, b) => a.readyAt - b.readyAt);

  // Per-crop running counter, seeded from farmActivity. The upstream
  // pulls this base from `state.farmActivity[`${crop} Harvested`]` on
  // every harvest call.
  const counterByCrop: Partial<Record<CropName, number>> = {};

  const out: Timer[] = [];
  for (const { machineId, packIndex, pack, readyAt } of entries) {
    const baseCounter =
      counterByCrop[pack.crop] ??
      state.farmActivity?.[`${pack.crop} Harvested`] ??
      0;

    let amount = pack.amount ?? 0;
    let boosts: Boost[] = [];
    if (amount === 0) {
      try {
        const result = getCropMachinePackYield({
          state,
          pack,
          createdAt: Math.max(ctx.now, readyAt),
          prngArgs: { farmId: ctx.farmId, initialCounter: baseCounter },
        });
        amount = result.amount;
        boosts = result.boosts;
      } catch {
        // Fall back to seed count (1× per seed) if upstream throws.
        amount = pack.seeds;
      }
    }

    counterByCrop[pack.crop] = baseCounter + pack.seeds;

    out.push({
      id: `cropmachine:${machineId}:${packIndex}`,
      category: "Crop Machine",
      label: pack.crop,
      icon: getItemIcon(pack.crop),
      readyAt,
      predictedYield: { amount, item: pack.crop },
      boosts,
      // Unique per-slot key keeps each pack as its own card; the queue
      // matters here, unlike crops/fruits where plots all merge.
      aggregationKey: `Crop Machine|${machineId}|${packIndex}`,
      // Source is the seed input (a bulk quantity), not a count of
      // discrete nodes — the push body renders "900 Sunflower from
      // 300 seeds · Crop Machine".
      nodeLabel: "seeds",
      nodeCount: pack.seeds,
    });
  }

  return out;
}
