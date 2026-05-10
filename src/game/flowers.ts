// Flower duration + yield bridge.
//
// `getFlowerAmount` is exported by the submodule (sunflower-land/src/
// features/game/events/landExpansion/harvestFlower.ts) and reads
// `criticalHit` off the planted flower — those rolls are populated
// server-side, so calling the upstream gives us the same yield the
// game would award on harvest. We narrow the signature here.

import { FLOWERS, FLOWER_SEEDS } from "features/game/types/flowers";
import { getFlowerAmount as upstreamGetFlowerAmount } from "features/game/events/landExpansion/harvestFlower";

import type { FlowerName, GameState, PlantedFlower } from "./types.ts";

// Returns 0 if the flower name is unknown — caller should fail closed.
export function getFlowerGrowSeconds(name: FlowerName): number {
  const flower = (FLOWERS as Record<string, { seed?: string }>)[name];
  const seedName = flower?.seed;
  if (!seedName) return 0;
  const seed = (FLOWER_SEEDS as Record<string, { plantSeconds?: number }>)[
    seedName
  ];
  return Number(seed?.plantSeconds ?? 0);
}

// Mirrors harvestFlower.ts: prefer the precomputed `flower.amount`
// (set occasionally by other game events) and otherwise call the
// upstream predictor with the same `criticalDrop` callback the game
// uses at harvest.
export function getFlowerYield(
  game: GameState,
  flower: PlantedFlower,
): number {
  if (flower.amount !== undefined) return flower.amount;
  const result = upstreamGetFlowerAmount({
    game,
    criticalDrop: (name: string) =>
      Boolean(flower.criticalHit?.[name] ?? 0),
  });
  return Number(result?.amount ?? 1);
}
