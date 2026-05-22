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
import { NODE_LABEL } from "./resources.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// One Timer per flower bed — beds don't aggregate well because each is
// planted independently and the player can stagger plant times across
// beds of the same flower. Player feedback (mango, 2026-05-18): "I only
// grow one type of flower, but with different time schedules. I think
// displaying each plot separately would be better." Same shape as
// beehives (`Beehives|${hiveId}`).
//
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
    criticalDrop: (name: CriticalHitName) => Boolean(criticalHit[name] ?? 0),
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

    // Mutant flower drop — `flower.reward` is server-rolled at plant
    // time (api `getFlowerReward` in plantFlower.ts; ~0.5%/day chance
    // per the FLOWER_SEEDS plant duration) and persisted into the
    // synced GameState. When present, items[0] is the chapter's mutant
    // flower (Prism Petal / Celestial Frostbloom / Primula Enigma /
    // …). Surface it as a chip so the player knows a special drop is
    // pending before they harvest.
    const rewardItem = flower.reward?.items?.[0];
    const bonus = rewardItem
      ? {
          icon: getItemIcon(rewardItem.name),
          label: rewardItem.name,
          type: "success" as const,
        }
      : undefined;

    out.push({
      id: `flower:${bedId}`,
      category: "Flowers",
      label: flower.name,
      icon: getItemIcon(flower.name),
      readyAt,
      predictedYield: { amount, item: flower.name },
      boosts,
      ...(bonus && { bonus }),
      // Unique per bed — each flower bed shows as its own card so a
      // player who plants the same flower at staggered times still sees
      // an individual countdown per plot.
      aggregationKey: `Flowers|${bedId}`,
      nodeLabel: NODE_LABEL[flower.name],
    });
  }

  return out;
}
