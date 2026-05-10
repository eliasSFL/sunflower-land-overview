import { getItemIcon, getCropYieldAmount } from "../game/index.ts";
import type { GameState } from "../game/index.ts";
import { CROP_SECONDS } from "../lib/durations.ts";
import type { Timer, TimerContext } from "./types.ts";

export function extractCropTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const plots = state.crops ?? {};
  const out: Timer[] = [];

  for (const [plotId, plot] of Object.entries(plots)) {
    const crop = plot.crop;
    if (!crop) continue;

    // The game shifts `plantedAt` into the past at plant time so any
    // grow-speed boost is already baked in. The in-game readiness check
    // is just `now - plantedAt >= harvestSeconds * 1000` (see
    // sunflower-land/src/features/game/events/landExpansion/harvest.ts:112).
    // crop.boostedTime is the *amount of time saved* in ms, kept for
    // analytics — it must NOT be subtracted again here.
    const grow = CROP_SECONDS[crop.name] ?? 0;
    const readyAt = crop.plantedAt + grow * 1000;

    const counter = ctx.counter.next();
    let amount = 1;
    try {
      const result = getCropYieldAmount({
        crop: crop.name,
        plot,
        game: state,
        createdAt: Math.max(ctx.now, readyAt),
        prngArgs: { farmId: ctx.farmId, counter },
      });
      amount = result.amount;
    } catch {
      // Fallback retains the `let amount = 1` initial value when upstream
      // throws — a drift signal, but don't hide every other timer
      // behind a single bad plot.
    }

    out.push({
      id: `crop:${plotId}`,
      category: "Crops",
      label: crop.name,
      icon: getItemIcon(crop.name),
      readyAt,
      predictedYield: { amount, item: crop.name },
      aggregationKey: `Crops|${crop.name}`,
    });
  }

  return out;
}
