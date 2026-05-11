import {
  GREENHOUSE_CROP_TIME_SECONDS,
  batchGreenhouseYields,
  getItemIcon,
  type GameState,
  type GreenhousePlantName,
  type GreenhousePot,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// Batched yield prediction — see src/game/batch-yields.ts.

export function extractGreenhouseTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const pots = state.greenhouse?.pots ?? {};

  type Row = {
    potId: string;
    pot: GreenhousePot;
    plantName: GreenhousePlantName;
    readyAt: number;
  };
  const rows: Row[] = [];
  for (const [potId, pot] of Object.entries(pots)) {
    if (!pot.plant) continue;
    const grow = GREENHOUSE_CROP_TIME_SECONDS[pot.plant.name] ?? 0;
    rows.push({
      potId,
      pot,
      plantName: pot.plant.name,
      readyAt: pot.plant.plantedAt + grow * 1000,
    });
  }

  const byName = new Map<GreenhousePlantName, Row[]>();
  for (const row of rows) {
    const list = byName.get(row.plantName) ?? [];
    list.push(row);
    byName.set(row.plantName, list);
  }
  for (const list of byName.values()) {
    list.sort((a, b) => a.readyAt - b.readyAt);
  }

  const out: Timer[] = [];
  for (const [plantName, group] of byName) {
    const yields = batchGreenhouseYields({
      game: state,
      plantName,
      pots: group.map(({ potId, pot, readyAt }) => ({
        potId,
        pot,
        createdAt: Math.max(ctx.now, readyAt),
      })),
      farmId: ctx.farmId,
    });
    for (const { potId, readyAt } of group) {
      const entry = yields.get(potId);
      const amount = entry?.amount ?? 1;
      out.push({
        id: `greenhouse:${potId}`,
        category: "Greenhouse",
        label: plantName,
        icon: getItemIcon(plantName),
        readyAt,
        predictedYield: { amount, item: plantName },
        boosts: entry?.boosts,
        aggregationKey: `Greenhouse|${plantName}`,
      });
    }
  }

  return out;
}
