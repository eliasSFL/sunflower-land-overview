// Re-export of game yield calculations with explicit signatures. The
// upstream functions are typed as `any` (see game-modules.d.ts) — narrowing
// happens here so callers in src/timers/ get real type safety.

import { getCropYieldAmount as upstreamGetCropYieldAmount } from "features/game/events/landExpansion/harvest";
import { getFruitYield as upstreamGetFruitYield } from "features/game/events/landExpansion/fruitHarvested";
import { getGreenhouseCropYieldAmount as upstreamGetGreenhouseYield } from "features/game/events/landExpansion/harvestGreenHouse";
import { getPackYieldAmount as upstreamGetPackYieldAmount } from "features/game/events/landExpansion/harvestCropMachine";
import { getWoodDropAmount as upstreamGetWoodDropAmount } from "features/game/events/landExpansion/chop";
import { getStoneDropAmount as upstreamGetStoneDropAmount } from "features/game/events/landExpansion/stoneMine";
import { getIronDropAmount as upstreamGetIronDropAmount } from "features/game/events/landExpansion/ironMine";
import { getGoldDropAmount as upstreamGetGoldDropAmount } from "features/game/events/landExpansion/mineGold";
import { getCrimstoneDropAmount as upstreamGetCrimstoneDropAmount } from "features/game/events/landExpansion/mineCrimstone";
import { getOilDropAmount as upstreamGetOilDropAmount } from "features/game/events/landExpansion/drillOilReserve";
import { KNOWN_IDS } from "features/game/types";
import { getBoostIcon, getBoostLabel } from "./icons.ts";

import type {
  BoostName,
  CropMachineQueueItem,
  CropName,
  CropPlot,
  FiniteResource,
  FruitCompostName,
  GameState,
  GreenhouseCompostName,
  GreenhousePlantName,
  OilReserve,
  PatchFruitName,
  Rock,
  RockName,
  Tree,
  TreeName,
} from "./types.ts";

export type CropYieldArgs = {
  crop: CropName;
  plot?: CropPlot;
  game: GameState;
  createdAt: number;
  prngArgs?: { farmId: number; counter: number };
};

export type YieldBoost = {
  name: BoostName;
  value: string;
  icon: string;
  label: string;
};

export type CropYieldResult = {
  amount: number;
  boosts: YieldBoost[];
};

// Attach icon + label (resolved against `state`) to each boost in the
// upstream `boostsUsed` array. The `| undefined` accommodates fallback
// branches where we don't have a real upstream result to forward.
function normBoosts(
  raw: { name: BoostName; value: string }[] | undefined,
  state: GameState,
): YieldBoost[] {
  if (!raw) return [];
  return raw.map(({ name, value }) => ({
    name,
    value,
    icon: getBoostIcon(name, state),
    label: getBoostLabel(name),
  }));
}

export function getCropYieldAmount(args: CropYieldArgs): CropYieldResult {
  const result = upstreamGetCropYieldAmount(args);
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type PatchFruitYieldArgs = {
  name: PatchFruitName;
  game: GameState;
  fertiliser?: FruitCompostName;
  prngArgs?: { farmId: number; counter: number };
};

export function getPatchFruitYield(args: PatchFruitYieldArgs): CropYieldResult {
  const result = upstreamGetFruitYield(args);
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type GreenhouseYieldArgs = {
  crop: GreenhousePlantName;
  game: GameState;
  createdAt: number;
  prngArgs: { farmId: number; counter: number };
  fertiliser?: GreenhouseCompostName;
};

export function getGreenhouseYield(args: GreenhouseYieldArgs): CropYieldResult {
  const result = upstreamGetGreenhouseYield(args);
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
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
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.state),
  };
}

// --- Resource yields ---
// Each upstream function has its own arg shape; wrappers narrow to a
// uniform `{ amount: number }`. itemId comes from KNOWN_IDS so callers
// don't have to thread it. Sunstone doesn't have an upstream predictor
// — its yield is always 1 (see mineSunstone.ts:59).

// `nodeName` becomes both the `KNOWN_IDS` lookup key (controls
// `itemId` for prngChance) AND the `farmActivity` key suffix used to
// seed `counter` upstream. Defaults mirror the upstream branches:
//   tree → "Tree" (chop.ts:403, but counter key uses "Basic Tree Chopped")
//   stone → "Stone Rock"  iron → "Iron Rock"  gold → "Gold Rock"
const lookupId = (name: TreeName | RockName): number => KNOWN_IDS[name] ?? 0;

export type WoodYieldArgs = {
  game: GameState;
  tree: Tree;
  treeName: TreeName;
  farmId: number;
  counter: number;
};

export function getWoodYield(args: WoodYieldArgs): CropYieldResult {
  const result = upstreamGetWoodDropAmount({
    game: args.game,
    farmId: args.farmId,
    itemId: lookupId(args.treeName),
    counter: args.counter,
    tree: args.tree,
  });
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type StoneYieldArgs = {
  game: GameState;
  rock: Rock;
  rockName: RockName;
  id: string;
  createdAt: number;
  farmId: number;
  counter: number;
};

export function getStoneYield(args: StoneYieldArgs): CropYieldResult {
  const result = upstreamGetStoneDropAmount({
    game: args.game,
    rock: args.rock,
    createdAt: args.createdAt,
    id: args.id,
    farmId: args.farmId,
    counter: args.counter,
    itemId: lookupId(args.rockName),
  });
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type IronYieldArgs = {
  game: GameState;
  rock: Rock;
  rockName: RockName;
  createdAt: number;
  farmId: number;
  counter: number;
};

export function getIronYield(args: IronYieldArgs): CropYieldResult {
  const result = upstreamGetIronDropAmount({
    game: args.game,
    rock: args.rock,
    createdAt: args.createdAt,
    farmId: args.farmId,
    counter: args.counter,
    itemId: lookupId(args.rockName),
  });
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type GoldYieldArgs = {
  game: GameState;
  rock: Rock;
  rockName: RockName;
  createdAt: number;
  farmId: number;
  counter: number;
};

export function getGoldYield(args: GoldYieldArgs): CropYieldResult {
  const result = upstreamGetGoldDropAmount({
    game: args.game,
    rock: args.rock,
    createdAt: args.createdAt,
    farmId: args.farmId,
    counter: args.counter,
    itemId: lookupId(args.rockName),
  });
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type CrimstoneYieldArgs = {
  game: GameState;
  rock: FiniteResource;
};

export function getCrimstoneYield(args: CrimstoneYieldArgs): CropYieldResult {
  const result = upstreamGetCrimstoneDropAmount({
    game: args.game,
    rock: args.rock,
  });
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}

export type OilYieldArgs = {
  game: GameState;
  reserve: OilReserve;
};

export function getOilYield(args: OilYieldArgs): CropYieldResult {
  const result = upstreamGetOilDropAmount(args.game, args.reserve);
  return {
    amount: Number(result?.amount ?? 0),
    boosts: normBoosts(result?.boostsUsed, args.game),
  };
}
