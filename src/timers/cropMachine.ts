import {
  getCropMachinePackYield,
  getItemIcon,
  type CropMachineBuilding,
  type CropName,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per pack (queue slot). Yield prediction threads a per-crop
// counter across packs so two consecutive Sunflower packs predict in the
// same PRNG sequence the game would use if you harvested them one after
// the other — see harvestCropMachine.ts:initialCounter.

export function extractCropMachineTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const machines = (state.buildings?.["Crop Machine"] ??
    []) as CropMachineBuilding[];
  if (machines.length === 0) return [];

  type PackEntry = {
    machineId: string;
    packIndex: number;
    pack: CropMachineBuilding["queue"] extends (infer T)[] | undefined
      ? T
      : never;
    readyAt: number;
  };

  const entries: PackEntry[] = [];
  for (const [mIndex, machine] of machines.entries()) {
    const machineId = machine.id ?? `m${mIndex}`;
    const queue = machine.queue ?? [];
    for (const [packIndex, pack] of queue.entries()) {
      // Skip packs not yet started (waiting for oil): readyAt is unset
      // until the pack is actually being processed.
      if (!pack.readyAt) continue;
      entries.push({
        machineId,
        packIndex,
        pack,
        readyAt: pack.readyAt,
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
    if (amount === 0) {
      try {
        const result = getCropMachinePackYield({
          state,
          pack,
          createdAt: Math.max(ctx.now, readyAt),
          prngArgs: { farmId: ctx.farmId, initialCounter: baseCounter },
        });
        amount = result.amount;
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
      // Unique per-slot key keeps each pack as its own card; the queue
      // matters here, unlike crops/fruits where plots all merge.
      aggregationKey: `Crop Machine|${machineId}|${packIndex}`,
    });
  }

  return out;
}
