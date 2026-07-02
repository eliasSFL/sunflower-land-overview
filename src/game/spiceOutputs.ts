// Spice-rack output predictor — the same counter-threading shape as
// `batch-yields.ts`: loop the queue and call the upstream per-job helper
// (`getAgingOutput`) with a threaded PRNG counter, reading back the
// realized amount.
//
// This is how we predict the `Refiner` skill's +1 `Refined Salt` roll
// WITHOUT replicating it: the roll lives inside upstream `getAgingOutput`,
// which returns the realized amount (base, or base + 1 on a seeded hit).
// We reproduce the exact counter the server uses at collect —
// `farmActivity[<recipe> Spiced]`, advanced once per same-recipe job in
// collection order — so the prediction matches the real collect. (Aging's
// Prime flip can't be derived this way: its roll is an inline `prngChance`
// with no exported helper returning the outcome — hence that path reads a
// per-slot record instead.)
//
// Collection order is readyAt-ascending (what `collectSpiceRack` drains).
// Spice recipes have a fixed duration, so that equals queue/start order —
// we sort by readyAt to be exact regardless.

import Decimal from "decimal.js-light";
import { getAgingOutput } from "features/game/types/agingFormulas";
import {
  getSpiceRackRecipe,
  spiceRackCollectedActivity,
} from "features/game/types/spiceRack";
import { KNOWN_IDS } from "features/game/types";
import { getObjectEntries } from "lib/object";
import type { SpiceRackJob } from "features/game/lib/agingShed";
import type { GameState, InventoryItemName } from "./types.ts";

export type SpiceJobOutput = { item: InventoryItemName; amount: number };

// Realized outputs for every queued spice-rack job, keyed by job id. Each
// job's outputs carry the amount the server will actually grant — so a
// `Refined Salt` job whose seeded roll hits shows `amount: 2` (or `3` with
// Ager), and everything else its base amount.
export function predictSpiceOutputs(args: {
  game: GameState;
  jobs: SpiceRackJob[];
  farmId: number;
}): Map<string, SpiceJobOutput[]> {
  const { game, jobs, farmId } = args;
  const perJob = new Map<string, SpiceJobOutput[]>();

  // Per-recipe collect counter, seeded from the same farmActivity the
  // server reads, then advanced once per collected same-recipe job.
  const counters: Record<string, number> = {};

  // Thread counters in collection order (readyAt asc), then map results
  // back to each job by id so the caller can look them up in queue order.
  const collectionOrder = [...jobs].sort((a, b) => a.readyAt - b.readyAt);

  for (const job of collectionOrder) {
    try {
      const activity = spiceRackCollectedActivity(job.recipe);
      const base = game.farmActivity[activity] ?? 0;
      const counter = counters[job.recipe] ?? base;
      counters[job.recipe] = counter + 1;

      const recipeDef = getSpiceRackRecipe(job.recipe);
      const agerApplied = !!job.skills?.Ager;

      const outputs: SpiceJobOutput[] = [];
      for (const [item, amount] of getObjectEntries(recipeDef.outputs)) {
        const add = getAgingOutput(
          game,
          amount ?? new Decimal(0),
          item,
          agerApplied,
          { farmId, itemId: KNOWN_IDS[item], counter },
        );
        outputs.push({ item, amount: add.toNumber() });
      }
      perJob.set(job.id, outputs);
    } catch {
      perJob.set(job.id, []);
    }
  }

  return perJob;
}
