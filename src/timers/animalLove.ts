import {
  getItemIcon,
  getNextLoveAvailableAt,
  type Animal,
  type AnimalType,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per animal that has a pending love opportunity within its
// CURRENT sleep cycle. `getNextLoveAvailableAt` is the upstream helper
// (sunflower-land/src/features/game/events/landExpansion/
// applyAnimalFeedBuff.ts) — it mirrors the two throw-gates in
// `loveAnimal`: at least one third of the nap must have elapsed since
// `asleepAt`, and one third since the last `lovedAt`.
//
// Caller responsibility (documented on the upstream helper): once the
// returned timestamp is >= awakeAt, no love slot remains this cycle —
// either both slots were already used or the animal will wake before
// the next one opens. We skip those animals entirely.
//
// Animals only enter a sleep cycle after `claimProduce` runs (awakeAt
// stamped there); fresh / never-claimed animals have asleepAt = 0 and
// awakeAt = 0, which falls through the `awakeAt > 0` check below.
//
// Aggregation: one card per species — `Animals|Love|<type>` — pooling
// every animal of that type that's currently sleeping and loveable.
// The aggregator's earliest-readyAt picks the first animal to open up.

function* iterAnimals(state: GameState): Iterable<Animal> {
  const henHouse = state.henHouse;
  if (henHouse?.animals) {
    for (const animal of Object.values(henHouse.animals)) yield animal;
  }
  const barn = state.barn;
  if (barn?.animals) {
    for (const animal of Object.values(barn.animals)) yield animal;
  }
}

export function extractAnimalLoveTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  const out: Timer[] = [];

  for (const animal of iterAnimals(state)) {
    // Sick animals need medicine, not affection.
    if (animal.state === "sick") continue;

    // No sleep cycle on record (fresh or just-fed but not yet claimed).
    if (animal.awakeAt <= 0 || animal.awakeAt <= animal.asleepAt) continue;

    const nextLoveAt = getNextLoveAvailableAt(animal);

    // No remaining love slot in this sleep cycle — either both used or
    // wake-up arrives before the next slot opens.
    if (nextLoveAt >= animal.awakeAt) continue;

    const type = animal.type;
    out.push({
      id: `animal-love:${type}:${animal.id}`,
      category: "Animals",
      label: `Pet ${type}`,
      icon: getItemIcon(animal.item),
      readyAt: nextLoveAt,
      subtext: animal.item,
      aggregationKey: loveKey(type),
    });
  }

  return out;
}

function loveKey(type: AnimalType): string {
  return `Animals|Love|${type}`;
}
