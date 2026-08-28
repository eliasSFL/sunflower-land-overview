import {
  getAnimalReadyAt,
  getItemIcon,
  getNextLoveAvailableAt,
  type Animal,
  type AnimalType,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per animal that has a pending love opportunity within its
// CURRENT sleep cycle. `getNextLoveAvailableAt` is the upstream helper
// in sunflower-land/src/features/game/events/landExpansion/loveAnimal.ts
// — it mirrors the two throw-gates in `loveAnimal`: at least one third
// of the nap must have elapsed since `asleepAt`, and one third since
// the last `lovedAt`.
//
// Since #7578 the helper takes the wake time as an explicit argument
// rather than reading `animal.awakeAt` itself: animal sleep moved onto
// the windowed speed-rate model, so a Collie/Bantam Shrine opened
// mid-nap shortens the remainder and the stored `awakeAt` is only the
// legacy fallback. `getAnimalReadyAt(animal, state)` resolves the live
// one — the same thing upstream's own callers pass (see Barn.tsx /
// HenHouse.tsx). Both the love window and the "does a slot remain"
// comparison have to use it, or a boosted animal's card would sit on a
// stale third-of-the-nap.
//
// Caller responsibility (documented on the upstream helper): once the
// returned timestamp is >= the wake time, no love slot remains this
// cycle — either both slots were already used or the animal will wake
// before the next one opens. We skip those animals entirely.
//
// Animals only enter a sleep cycle after `claimProduce` runs (awakeAt
// stamped there); fresh / never-claimed animals have asleepAt = 0 and
// awakeAt = 0, which falls through the `awakeAt > 0` check below.
//
// Category: "Petting" — its own top-level section after "Animals" so
// the action ("love your animal") is visually distinct from production
// cards ("collect Egg / Milk / Wool").
//
// Aggregation: one card per species — `Petting|<type>` — pooling every
// animal of that type that's currently sleeping and loveable. The
// aggregator's earliest-readyAt picks the first animal to open up.

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
    // This existence test stays on the stored field: an animal that has
    // never slept carries `awakeAt: 0` and no `baseDurationMs` marker,
    // the same case upstream's own guards special-case.
    if (animal.awakeAt <= 0) continue;

    // The live wake time, which under the speed-rate model can sit
    // earlier than the stored `awakeAt`.
    const readyAt = getAnimalReadyAt(animal, state);

    // Degenerate cycle (just-fed but not yet claimed) — the nap has no
    // positive length to take thirds of.
    if (readyAt <= animal.asleepAt) continue;

    const nextLoveAt = getNextLoveAvailableAt(animal, readyAt);

    // No remaining love slot in this sleep cycle — either both used or
    // wake-up arrives before the next slot opens.
    if (nextLoveAt >= readyAt) continue;

    const type = animal.type;
    out.push({
      id: `animal-love:${type}:${animal.id}`,
      category: "Petting",
      label: `Pet ${type}`,
      icon: getItemIcon(animal.item),
      readyAt: nextLoveAt,
      subtext: animal.item,
      aggregationKey: pettingKey(type),
    });
  }

  return out;
}

function pettingKey(type: AnimalType): string {
  return `Petting|${type}`;
}
