import { getGreenhouseYield, getItemIcon } from "../game/index.ts";
import type { GameState } from "../game/index.ts";
import { GREENHOUSE_SECONDS } from "../lib/durations.ts";
import type { Timer, TimerContext } from "./types.ts";

export function extractGreenhouseTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const pots = state.greenhouse?.pots ?? {};
  const out: Timer[] = [];

  for (const [potId, pot] of Object.entries(pots)) {
    const plant = pot.plant;
    if (!plant) continue;

    const grow = GREENHOUSE_SECONDS[plant.name] ?? 0;
    const readyAt = plant.plantedAt + grow * 1000;

    const counter = ctx.counter.next();
    let amount = 1;
    try {
      const result = getGreenhouseYield({
        crop: plant.name,
        game: state,
        createdAt: Math.max(ctx.now, readyAt),
        fertiliser: pot.fertiliser?.name,
        prngArgs: { farmId: ctx.farmId, counter },
      });
      amount = result.amount;
    } catch {
      // Retain the initial `amount = 1` on upstream throw.
    }

    out.push({
      id: `greenhouse:${potId}`,
      category: "Greenhouse",
      label: plant.name,
      icon: getItemIcon(plant.name),
      readyAt,
      predictedYield: { amount, item: plant.name },
      aggregationKey: `Greenhouse|${plant.name}`,
    });
  }

  return out;
}
