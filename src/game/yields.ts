// Re-export of game yield calculations with explicit signatures. The
// upstream functions are typed as `any` (see game-modules.d.ts) — narrowing
// happens here so callers in src/timers/ get real type safety.

import { getCropYieldAmount as upstreamGetCropYieldAmount } from "features/game/events/landExpansion/harvest";
import { getFruitYield as upstreamGetFruitYield } from "features/game/events/landExpansion/fruitHarvested";
import { getGreenhouseCropYieldAmount as upstreamGetGreenhouseYield } from "features/game/events/landExpansion/harvestGreenHouse";
import { getPackYieldAmount as upstreamGetPackYieldAmount } from "features/game/events/landExpansion/harvestCropMachine";

import type {
  CropMachineQueueItem,
  CropName,
  CropPlot,
  GameState,
  GreenhousePlantName,
  PatchFruitName,
} from "./types.ts";

export type CropYieldArgs = {
  crop: CropName;
  plot?: CropPlot;
  game: GameState;
  createdAt: number;
  prngArgs?: { farmId: number; counter: number };
};

export type CropYieldResult = {
  amount: number;
};

export function getCropYieldAmount(args: CropYieldArgs): CropYieldResult {
  const result = upstreamGetCropYieldAmount(args);
  return { amount: Number(result?.amount ?? 0) };
}

export type PatchFruitYieldArgs = {
  name: PatchFruitName;
  game: GameState;
  fertiliser?: string;
  prngArgs?: { farmId: number; counter: number };
};

export function getPatchFruitYield(
  args: PatchFruitYieldArgs,
): CropYieldResult {
  const result = upstreamGetFruitYield(args);
  return { amount: Number(result?.amount ?? 0) };
}

export type GreenhouseYieldArgs = {
  crop: GreenhousePlantName;
  game: GameState;
  createdAt: number;
  prngArgs: { farmId: number; counter: number };
  fertiliser?: string;
};

export function getGreenhouseYield(
  args: GreenhouseYieldArgs,
): CropYieldResult {
  const result = upstreamGetGreenhouseYield(args);
  return { amount: Number(result?.amount ?? 0) };
}

export type CropMachinePackYieldArgs = {
  state: GameState;
  pack: CropMachineQueueItem;
  createdAt: number;
  // The base counter the upstream loops from. Each seed in the pack
  // advances the counter by one, so callers wanting to predict yields
  // for *consecutive* packs of the same crop must offset this by the
  // total seed count of every preceding pack of the same crop.
  prngArgs: { farmId: number; initialCounter: number };
};

export function getCropMachinePackYield(
  args: CropMachinePackYieldArgs,
): CropYieldResult {
  const result = upstreamGetPackYieldAmount(args);
  return { amount: Number(result?.amount ?? 0) };
}
