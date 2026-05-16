// Batch yield predictors — loop the upstream per-plot yield function the
// same way `bulkHarvest` / `harvestCropMachine.getPackYieldAmount` do:
//
//   counter = farmActivity[<name> Harvested|Mined|Chopped] ?? 0
//   for each node:
//     amount += upstreamYield({ ..., prngArgs: { farmId, counter } })
//     counter++
//     // thread the returned `aoe` back into game so AOE-gated bonuses
//     // (Scary Mike, etc.) fire on at most one node per area
//
// Each result entry carries both `amount` and the `boosts` array the
// upstream surfaced, so callers (the timer extractors → TimerCard) can
// show players exactly *why* a yield is what it is.
//
// We keep these here — not in the submodule — because the upstream
// exposes per-plot helpers and a single crop-machine batch helper; the
// "per-resource-type batch" wrapper is overview-specific.

import { getCropYieldAmount as upstreamGetCropYieldAmount } from "features/game/events/landExpansion/harvest";
import { getFruitYield as upstreamGetFruitYield } from "features/game/events/landExpansion/fruitHarvested";
import { getGreenhouseCropYieldAmount as upstreamGetGreenhouseYield } from "features/game/events/landExpansion/harvestGreenHouse";
import { getWoodDropAmount as upstreamGetWoodDropAmount } from "features/game/events/landExpansion/chop";
import { getStoneDropAmount as upstreamGetStoneDropAmount } from "features/game/events/landExpansion/stoneMine";
import { getIronDropAmount as upstreamGetIronDropAmount } from "features/game/events/landExpansion/ironMine";
import { getGoldDropAmount as upstreamGetGoldDropAmount } from "features/game/events/landExpansion/mineGold";
import { getCrimstoneDropAmount as upstreamGetCrimstoneDropAmount } from "features/game/events/landExpansion/mineCrimstone";
import { getOilDropAmount as upstreamGetOilDropAmount } from "features/game/events/landExpansion/drillOilReserve";
import { KNOWN_IDS } from "features/game/types";
import { getBoostIcon, getBoostLabel } from "./icons.ts";

import type {
  AOE,
  BoostName,
  CropName,
  CropPlot,
  FiniteResource,
  FruitPatch,
  GameState,
  GreenhousePlantName,
  GreenhousePot,
  OilReserve,
  PatchFruitName,
  Rock,
  RockName,
  Tree,
  TreeName,
} from "./types.ts";
import type { FarmActivityName } from "features/game/types/farmActivity.ts";

// Per-node yield prediction. `boosts` lists every boost the upstream
// reported via `boostsUsed`; empty array if none fired. Icons + labels
// are resolved here (same `state` we already have) so downstream UI
// doesn't need to know about GameState.
export type YieldBoost = {
  name: BoostName;
  value: string;
  icon: string;
  label: string;
  // Per-node multiplier weight; absent ≡ 1. Resource nodes (trees,
  // stones, iron, gold) can have an innate `multiplier` (e.g. 16 for
  // an ancient tree) — every boost firing on that node contributes
  // `multiplier` times harder. The aggregator uses this when merging
  // identical name+value pairs so a single ancient tree shows as
  // "x1.2 ×16" instead of "x1.2 ×1".
  weight?: number;
};

export type YieldEntry = {
  amount: number;
  boosts: YieldBoost[];
};

export type YieldMap = Map<string, YieldEntry>;

const lookupId = (name: TreeName | RockName): number => KNOWN_IDS[name] ?? 0;

const farmActivity = (
  state: GameState,
): Partial<Record<FarmActivityName, number>> => state.farmActivity;

// Attach icon + label (resolved against `state`) to each boost in the
// upstream `boostsUsed` array. Every upstream yield function returns
// this as a typed `{ name: BoostName; value: string }[]`; the
// `| undefined` accommodates fallback branches where we don't have a
// real upstream result to forward.
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

// Tag every boost on a resource node with the node's innate multiplier.
// Resource yields in the submodule scale the whole accumulated `amount`
// by `node.multiplier ?? 1` before returning, so a single ancient tree
// (multiplier 16) contributes 16× the effect of a normal tree (1) for
// every boost. The aggregator uses `boost.weight` to weight the merge
// count: a Foreman Beaver firing on one ancient tree shows up as
// "x1.2 ×16", not "x1.2 ×1".
//
// EXCEPTION: Tier 2/3 Bonus rows are pushed by upstream AFTER the
// innate multiplier (`amount *= multiplier; amount += 0.5;`), so their
// face value already reflects the true contribution regardless of
// node multiplier. They get weight 1 — a single ancient tree shows
// "Tier 3 Bonus +2.5 ×1", not "×16".
const POST_MULTIPLIER_BOOSTS = new Set(["Tier 2 Bonus", "Tier 3 Bonus"]);

function weightBoosts(
  boosts: YieldBoost[],
  nodeMultiplier: number,
): YieldBoost[] {
  if (!Number.isFinite(nodeMultiplier) || nodeMultiplier === 1) return boosts;
  return boosts.map((b) =>
    POST_MULTIPLIER_BOOSTS.has(b.name) ? b : { ...b, weight: nodeMultiplier },
  );
}

// --- Crops ----------------------------------------------------------

export function batchCropYields(args: {
  game: GameState;
  cropName: CropName;
  plots: Array<{ plotId: string; plot: CropPlot; createdAt: number }>;
  farmId: number;
}): YieldMap {
  const { game, cropName, plots, farmId } = args;
  const result: YieldMap = new Map();

  const initialCounter = farmActivity(game)[`${cropName} Harvested`] ?? 0;
  let counter = initialCounter;
  let workingGame: GameState = game;

  for (const { plotId, plot, createdAt } of plots) {
    const preset = plot.crop?.amount;
    if (preset !== undefined) {
      result.set(plotId, { amount: Number(preset), boosts: [] });
      continue;
    }
    try {
      const upstream = upstreamGetCropYieldAmount({
        crop: cropName,
        plot,
        game: workingGame,
        createdAt,
        prngArgs: { farmId, counter },
      });
      result.set(plotId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: normBoosts(upstream?.boostsUsed, game),
      });
      if (upstream?.aoe) {
        // Carry the mutated aoe forward so an AOE that fired on this
        // plot can't fire again on the next plot in the same area.
        workingGame = { ...workingGame, aoe: upstream.aoe };
      }
    } catch {
      result.set(plotId, { amount: 1, boosts: [] });
    }
    counter += 1;
  }
  return result;
}

// --- Patch fruit ----------------------------------------------------
// No AOE in `getFruitYield`; per-plot counter advance is enough.

export function batchPatchFruitYields(args: {
  game: GameState;
  fruitName: PatchFruitName;
  patches: Array<{ patchId: string; patch: FruitPatch }>;
  farmId: number;
}): YieldMap {
  const { game, fruitName, patches, farmId } = args;
  const result: YieldMap = new Map();

  const initialCounter = farmActivity(game)[`${fruitName} Harvested`] ?? 0;
  let counter = initialCounter;

  for (const { patchId, patch } of patches) {
    const fruit = patch.fruit;
    if (!fruit) continue;
    const preset = fruit.amount;
    if (preset !== undefined) {
      result.set(patchId, { amount: Number(preset), boosts: [] });
      continue;
    }
    try {
      const upstream = upstreamGetFruitYield({
        name: fruitName,
        game,
        fertiliser: patch.fertiliser?.name,
        prngArgs: { farmId, counter },
      });
      result.set(patchId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: normBoosts(upstream?.boostsUsed, game),
      });
    } catch {
      result.set(patchId, { amount: 1, boosts: [] });
    }
    counter += 1;
  }
  return result;
}

// --- Greenhouse -----------------------------------------------------
// No AOE.

export function batchGreenhouseYields(args: {
  game: GameState;
  plantName: GreenhousePlantName;
  pots: Array<{ potId: string; pot: GreenhousePot; createdAt: number }>;
  farmId: number;
}): YieldMap {
  const { game, plantName, pots, farmId } = args;
  const result: YieldMap = new Map();

  const initialCounter = farmActivity(game)[`${plantName} Harvested`] ?? 0;
  let counter = initialCounter;

  for (const { potId, pot, createdAt } of pots) {
    const plant = pot.plant;
    if (!plant) continue;
    const preset = plant.amount;
    if (preset !== undefined) {
      result.set(potId, { amount: Number(preset), boosts: [] });
      continue;
    }
    try {
      const upstream = upstreamGetGreenhouseYield({
        crop: plantName,
        game,
        createdAt,
        fertiliser: pot.fertiliser?.name,
        prngArgs: { farmId, counter },
      });
      result.set(potId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: normBoosts(upstream?.boostsUsed, game),
      });
    } catch {
      result.set(potId, { amount: 1, boosts: [] });
    }
    counter += 1;
  }
  return result;
}

// --- Trees / Wood ---------------------------------------------------
// AOE-gated (Beavers etc.). Thread aoe across calls.

export function batchWoodYields(args: {
  game: GameState;
  treeName: TreeName;
  trees: Array<{ nodeId: string; tree: Tree }>;
  farmId: number;
}): YieldMap {
  const { game, treeName, trees, farmId } = args;
  const result: YieldMap = new Map();

  const activityKey: FarmActivityName = `${treeName === "Tree" ? "Basic Tree" : treeName} Chopped`;
  const initialCounter = farmActivity(game)[activityKey] ?? 0;
  let counter = initialCounter;
  const itemId = lookupId(treeName);

  for (const { nodeId, tree } of trees) {
    const preset = tree.wood.amount;
    if (preset !== undefined) {
      result.set(nodeId, { amount: Number(preset), boosts: [] });
      continue;
    }
    try {
      const upstream = upstreamGetWoodDropAmount({
        game,
        farmId,
        itemId,
        counter,
        tree,
      });
      result.set(nodeId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: weightBoosts(
          normBoosts(upstream?.boostsUsed, game),
          tree.multiplier ?? 1,
        ),
      });
      // getWoodDropAmount doesn't return aoe — wood bonuses aren't
      // AOE-gated. No state threading needed.
    } catch {
      result.set(nodeId, { amount: 1, boosts: [] });
    }
    counter += 1;
  }
  return result;
}

// --- Stone / Iron / Gold -------------------------------------------
// All have AOE returns.

// All three upstream rock-yield fns share these args; stone has `id`
// required while iron/gold don't accept it. Wrappers below drop the
// `id` for the latter two so a single batch loop can call any of them
// through this signature without a cast.
type RockYieldUpstream = (args: {
  game: GameState;
  rock: Rock;
  createdAt: number;
  farmId: number;
  counter: number;
  itemId: number;
  id: string;
}) => {
  amount: number | { toNumber: () => number };
  aoe?: AOE;
  boostsUsed?: { name: BoostName; value: string }[];
};

function batchRockYields(
  upstreamFn: RockYieldUpstream,
  args: {
    game: GameState;
    rockName: RockName;
    rocks: Array<{ nodeId: string; rock: Rock; createdAt: number }>;
    farmId: number;
  },
): YieldMap {
  const { game, rockName, rocks, farmId } = args;
  const result: YieldMap = new Map();

  const initialCounter = farmActivity(game)[`${rockName} Mined`] ?? 0;
  let counter = initialCounter;
  let workingGame: GameState = game;
  const itemId = lookupId(rockName);

  for (const { nodeId, rock, createdAt } of rocks) {
    const preset = (rock.stone as { amount?: number }).amount;
    if (preset !== undefined) {
      result.set(nodeId, { amount: Number(preset), boosts: [] });
      continue;
    }
    try {
      const upstream = upstreamFn({
        game: workingGame,
        rock,
        createdAt,
        farmId,
        counter,
        itemId,
        id: nodeId,
      });
      result.set(nodeId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: weightBoosts(
          normBoosts(upstream?.boostsUsed, game),
          rock.multiplier ?? 1,
        ),
      });
      if (upstream?.aoe) {
        workingGame = { ...workingGame, aoe: upstream.aoe };
      }
    } catch {
      result.set(nodeId, { amount: 1, boosts: [] });
    }
    counter += 1;
  }
  return result;
}

// Iron / gold ignore `id` — wrapping them drops the field before the
// upstream call so we can share `RockYieldUpstream` across all three.
const stoneYieldFn: RockYieldUpstream = upstreamGetStoneDropAmount;
const ironYieldFn: RockYieldUpstream = ({ id: _id, ...rest }) =>
  upstreamGetIronDropAmount(rest);
const goldYieldFn: RockYieldUpstream = ({ id: _id, ...rest }) =>
  upstreamGetGoldDropAmount(rest);

export const batchStoneYields = (args: Parameters<typeof batchRockYields>[1]) =>
  batchRockYields(stoneYieldFn, args);
export const batchIronYields = (args: Parameters<typeof batchRockYields>[1]) =>
  batchRockYields(ironYieldFn, args);
export const batchGoldYields = (args: Parameters<typeof batchRockYields>[1]) =>
  batchRockYields(goldYieldFn, args);

// --- Crimstone ------------------------------------------------------
// No PRNG counter (yield function doesn't take prngArgs). Per node:
// `getCrimstoneDropAmount({ game, rock })`.

export function batchCrimstoneYields(args: {
  game: GameState;
  rocks: Array<{ nodeId: string; rock: FiniteResource }>;
}): YieldMap {
  const { game, rocks } = args;
  const result: YieldMap = new Map();
  for (const { nodeId, rock } of rocks) {
    const preset = (rock.stone as { amount?: number }).amount;
    if (preset !== undefined) {
      result.set(nodeId, { amount: Number(preset), boosts: [] });
      continue;
    }
    try {
      const upstream = upstreamGetCrimstoneDropAmount({ game, rock });
      result.set(nodeId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: normBoosts(upstream?.boostsUsed, game),
      });
    } catch {
      result.set(nodeId, { amount: 1, boosts: [] });
    }
  }
  return result;
}

// --- Sunstone -------------------------------------------------------
// Always 1 per mine (mineSunstone.ts:59). No boosts apply upstream.

export function batchSunstoneYields(args: {
  rocks: Array<{ nodeId: string }>;
}): YieldMap {
  const result: YieldMap = new Map();
  for (const { nodeId } of args.rocks)
    result.set(nodeId, { amount: 1, boosts: [] });
  return result;
}

// --- Oil ------------------------------------------------------------
// No PRNG; yield depends on `reserve.drilled` (every 3rd drill drops
// bonus oil). We're not threading reserve.drilled either — predictions
// reflect the *next* drill of each reserve as currently stored.

export function batchOilYields(args: {
  game: GameState;
  reserves: Array<{ nodeId: string; reserve: OilReserve }>;
}): YieldMap {
  const { game, reserves } = args;
  const result: YieldMap = new Map();
  for (const { nodeId, reserve } of reserves) {
    try {
      const upstream = upstreamGetOilDropAmount(game, reserve);
      result.set(nodeId, {
        amount: Number(upstream?.amount ?? 0),
        boosts: normBoosts(upstream?.boostsUsed, game),
      });
    } catch {
      result.set(nodeId, { amount: 1, boosts: [] });
    }
  }
  return result;
}
