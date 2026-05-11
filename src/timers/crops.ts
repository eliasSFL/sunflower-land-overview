import {
  CROPS,
  batchCropYields,
  getItemIcon,
  type CropName,
  type CropPlot,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// Yield prediction = batch loop, threaded AOE — see
// src/game/batch-yields.ts:batchCropYields. We group plots by crop
// name (so each crop's farmActivity counter starts fresh), call the
// batch helper once, then push one Timer per plot with that plot's
// computed amount. The aggregator sums by category|cropName.

export function extractCropTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const plots = state.crops ?? {};

  type Row = {
    plotId: string;
    plot: CropPlot;
    cropName: CropName;
    readyAt: number;
  };
  const rows: Row[] = [];
  for (const [plotId, plot] of Object.entries(plots)) {
    if (!plot.crop) continue;
    const grow = CROPS[plot.crop.name]?.harvestSeconds ?? 0;
    rows.push({
      plotId,
      plot,
      cropName: plot.crop.name,
      readyAt: plot.crop.plantedAt + grow * 1000,
    });
  }

  // Group by crop name + sort each group by readyAt so the AOE-firing
  // plot is consistently the earliest one.
  const byName = new Map<CropName, Row[]>();
  for (const row of rows) {
    const list = byName.get(row.cropName) ?? [];
    list.push(row);
    byName.set(row.cropName, list);
  }
  for (const list of byName.values()) {
    list.sort((a, b) => a.readyAt - b.readyAt);
  }

  // Compute amounts per group, then emit Timers.
  const out: Timer[] = [];
  for (const [cropName, group] of byName) {
    const yields = batchCropYields({
      game: state,
      cropName,
      plots: group.map(({ plotId, plot, readyAt }) => ({
        plotId,
        plot,
        createdAt: Math.max(ctx.now, readyAt),
      })),
      farmId: ctx.farmId,
    });
    for (const { plotId, readyAt } of group) {
      const entry = yields.get(plotId);
      const amount = entry?.amount ?? 1;
      out.push({
        id: `crop:${plotId}`,
        category: "Crops",
        label: cropName,
        icon: getItemIcon(cropName),
        readyAt,
        predictedYield: { amount, item: cropName },
        boosts: entry?.boosts,
        aggregationKey: `Crops|${cropName}`,
      });
    }
  }

  return out;
}
