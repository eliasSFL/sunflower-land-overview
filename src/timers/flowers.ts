import {
  FLOWERS,
  FLOWER_SEEDS,
  getBoostIcon,
  getBoostLabel,
  getFlowerAmount,
  getItemIcon,
  type BoostName,
  type CriticalHitName,
  type GameState,
  type PlantedFlower,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// readyAt mirrors harvestFlower.ts: speed boosts are baked into
// `plantedAt` at plant time (see plantFlower.ts:getPlantedAt), so the
// runtime check is just `now >= plantedAt + plantSeconds * 1000`.
//
// Yield = `flower.amount` if pre-computed, otherwise call upstream
// `getFlowerAmount` with the same criticalDrop callback the game uses at
// harvest. The lottery rolls in `flower.criticalHit` are populated
// server-side, so the prediction matches the harvest outcome.

function predictAmount(
  game: GameState,
  flower: PlantedFlower,
): { amount: number; boosts: Boost[] } {
  if (flower.amount !== undefined) return { amount: flower.amount, boosts: [] };
  const criticalHit = flower.criticalHit ?? {};
  const result = getFlowerAmount({
    game,
    criticalDrop: (name: CriticalHitName) =>
      Boolean(criticalHit[name] ?? 0),
  }) as {
    amount?: number;
    boostsUsed?: Array<{ name: BoostName; value: string }>;
  };
  const boosts: Boost[] = Array.isArray(result?.boostsUsed)
    ? result.boostsUsed.map((b) => {
        const name = b.name;
        return {
          name,
          value: String(b.value),
          icon: getBoostIcon(name, game),
          label: getBoostLabel(name),
        };
      })
    : [];
  return { amount: Number(result?.amount ?? 1), boosts };
}

export function extractFlowerTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const beds = state.flowers?.flowerBeds ?? {};
  const out: Timer[] = [];

  for (const [bedId, bed] of Object.entries(beds)) {
    const flower = bed.flower;
    if (!flower) continue;

    const seedName = FLOWERS[flower.name]?.seed;
    const growSeconds = seedName
      ? FLOWER_SEEDS[seedName]?.plantSeconds
      : undefined;
    if (!growSeconds) {
      console.warn(
        `[flowers] unknown grow time for "${flower.name}" — skipping bed`,
      );
      continue;
    }

    // Advance the global PRNG counter so flowers participate in the
    // same sequence as other categories — keeps yields elsewhere stable
    // when flower beds are added or removed.
    ctx.counter.next();

    let amount = 1;
    let boosts: Boost[] = [];
    try {
      const result = predictAmount(state, flower);
      amount = result.amount;
      boosts = result.boosts;
    } catch {
      // Retain the initial `amount = 1` on upstream throw.
    }
    const readyAt = flower.plantedAt + growSeconds * 1000;

    out.push({
      id: `flower:${bedId}`,
      category: "Flowers",
      label: flower.name,
      icon: getItemIcon(flower.name),
      readyAt,
      predictedYield: { amount, item: flower.name },
      boosts,
      aggregationKey: `Flowers|${flower.name}`,
    });
  }

  return out;
}
