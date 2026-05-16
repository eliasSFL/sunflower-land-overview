import {
  ANIMAL_RESOURCE_DROP,
  getAnimalLevel,
  getBoostIcon,
  getItemIcon,
  getKeys,
  getResourceDropAmount,
  type Animal,
  type AnimalResource,
  type AnimalType,
  type AnimalLevel,
  type BoostName,
  type GameState,
} from "../game/index.ts";

// AnimalLevel is a numeric literal union 0..15. `satisfies` verifies
// every key + value stays inside that union, so `NEXT_LEVEL[current]`
// is statically typed as AnimalLevel — no `as` cast needed when
// stepping from the current level to the next.
const NEXT_ANIMAL_LEVEL = {
  0: 1,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
  9: 10,
  10: 11,
  11: 12,
  12: 13,
  13: 14,
  14: 15,
  15: 15,
} as const satisfies Record<AnimalLevel, AnimalLevel>;
import type { Boost, Timer, TimerContext } from "./types.ts";

// One Timer per (animal, resource at the animal's current level). The
// aggregator stacks all timers sharing `Animals|<type>|<resource>` into
// a single card — matches the Resources panel pattern: a "Egg" card
// pools every egg-producing chicken, an "Egg readyAt" countdown that
// represents the earliest chicken to become claimable.
//
// State handling — keep it lenient. We surface a timer whenever the
// animal has a level >= 1 (skipping level-0 / fresh animals with no
// drop table). Sick animals are skipped (they need medicine, not time).
// `readyAt` is always `animal.awakeAt`:
//   - state "ready" → awakeAt is in the past → "Ready" status.
//   - state "idle"/"happy"/"sad" + awakeAt past → also reads as
//     "Ready" even though the player still needs to feed; we accept
//     the imprecision because the alternative (suppressing the card)
//     hides actionable animals from the overview.
//   - state "idle" + awakeAt future → countdown until they wake up
//     (post-claim sleep cycle).
// Predicted yield reflects each animal's *next claim* drop at its
// current level + boosts.

function toBoosts(
  raw: ReadonlyArray<{ name: BoostName; value: string }>,
  state: GameState,
): Boost[] | undefined {
  if (raw.length === 0) return undefined;
  return raw.map(({ name, value }) => ({
    name,
    value,
    icon: getBoostIcon(name, state),
  }));
}

function* iterAnimals(state: GameState): Iterable<Animal> {
  const henHouse = state.henHouse;
  if (henHouse?.animals) {
    for (const animal of Object.values(henHouse.animals)) {
      yield animal;
    }
  }
  const barn = state.barn;
  if (barn?.animals) {
    for (const animal of Object.values(barn.animals)) {
      yield animal;
    }
  }
}

export function extractAnimalTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  const out: Timer[] = [];

  for (const animal of iterAnimals(state)) {
    if (animal.state === "sick") continue;

    const type = animal.type;
    // claimProduce only runs when state === "ready" (the upstream throws
    // otherwise), and it reads `getAnimalLevel(experience)` at that
    // moment. So for "ready" animals our current level matches the
    // claim-time level. For idle/happy/sad the player still needs to
    // feed (possibly multiple times) before the animal becomes "ready" —
    // and the state only flips to "ready" when a feed crosses a level
    // threshold, so the claim-time level is at least current + 1.
    const currentLevel = getAnimalLevel(animal.experience, type);
    const level: AnimalLevel =
      animal.state === "ready"
        ? currentLevel
        : NEXT_ANIMAL_LEVEL[currentLevel];
    const drops = ANIMAL_RESOURCE_DROP[type][level];
    const resources = getKeys(drops);
    // Level 0 = no drop table entries; nothing meaningful to surface yet.
    if (resources.length === 0) continue;

    for (const resource of resources) {
      const baseDecimal = drops[resource];
      if (!baseDecimal) continue;
      const baseAmount = baseDecimal.toNumber();
      const { amount, boostsUsed } = getResourceDropAmount({
        game: state,
        animalType: type,
        resource,
        baseAmount,
        multiplier: animal.multiplier ?? 0,
        animal,
      });

      out.push({
        id: `animal:${type}:${animal.id}:${resource}`,
        category: "Animals",
        label: resource,
        icon: getItemIcon(resource),
        readyAt: animal.awakeAt,
        predictedYield: { amount, item: resource },
        boosts: toBoosts(boostsUsed, state),
        // Every animal stacked into this card shares the same type
        // (aggregationKey scopes by type), so the species reads as the
        // subtext — same role as the composter / cooking-building names
        // on those cards.
        subtext: type,
        aggregationKey: animalKey(type, resource),
      });
    }
  }

  return out;
}

function animalKey(type: AnimalType, resource: AnimalResource): string {
  return `Animals|${type}|${resource}`;
}
