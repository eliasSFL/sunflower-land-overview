/**
 * Yield prediction service.
 *
 * Imports the game's harvest functions directly from the merged sunflower-land
 * subtree (Vite resolves the bare specifiers via aliases in vite.config.ts;
 * tsc treats them as ambient `any` per src/types/game-modules.d.ts). Each
 * predictor is wrapped in a try/catch so a single section failing — e.g. an
 * unexpected save shape — doesn't break the whole panel.
 *
 * Every predictor that backs a chance-based game function takes `farmId` and
 * `counter` so the prng seed is the same one the game would use at harvest
 * time. The caller (timers.ts) is responsible for advancing `counter` once
 * per item of the same activity type — see "predictive farmActivity" below.
 */
import { getCropYieldAmount } from "features/game/events/landExpansion/harvest";
import { getFruitYield } from "features/game/events/landExpansion/fruitHarvested";
import { getGreenhouseCropYieldAmount } from "features/game/events/landExpansion/harvestGreenHouse";
import { getWoodDropAmount } from "features/game/events/landExpansion/chop";
import { getStoneDropAmount } from "features/game/events/landExpansion/stoneMine";
import { getIronDropAmount } from "features/game/events/landExpansion/ironMine";
import { getGoldDropAmount } from "features/game/events/landExpansion/mineGold";
import { getCrimstoneDropAmount } from "features/game/events/landExpansion/mineCrimstone";
import { getOilDropAmount } from "features/game/events/landExpansion/drillOilReserve";
import { getObsidianYield } from "features/game/events/landExpansion/collectLavaPit";
import { getResourceDropAmount } from "features/game/lib/animals";
import { getHoneyMultiplier } from "features/game/events/landExpansion/harvestBeehive";
import {
  getMaxStoredSaltCharges,
  getSaltChargeGenerationTime,
  getSaltYieldPerRake,
  syncSaltNode,
} from "features/game/types/salt";
import { isCollectibleBuilt } from "features/game/lib/collectibleBuilt";
import { isWearableActive } from "features/game/lib/wearables";
import { KNOWN_IDS } from "features/game/types";

// Game functions are typed `any` in the overview (see game-modules.d.ts), so
// the loose call shape below is intentional — we wrap with narrow returns.
type Game = any;

const SAFE = <T>(fn: () => T, fallback: T | null = null): T | null => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const NOW = () => Date.now();
const HOUR_MS = 60 * 60 * 1000;

/**
 * Predictors that pass `createdAt` into the game's harvest functions feed
 * the timer's `readyAt` (capped at NOW() for already-ready items) rather
 * than the literal current time. AOE collectible cooldowns and time-based
 * buffs are evaluated against this — see the comment on `extractTimers`
 * for the full rationale.
 */
const at = (readyAt: number): number => Math.max(NOW(), readyAt);

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  // decimal.js-light values expose toNumber()
  if (v && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return 0;
};

const itemIdOf = (name: string): number =>
  ((KNOWN_IDS as unknown) as Record<string, number | undefined>)[name] ?? 0;

export const predictCrop = (
  game: Game,
  plotId: string,
  readyAt: number,
  farmId: number,
  counter: number,
): number | null =>
  SAFE(() => {
    const plot = game?.crops?.[plotId];
    const crop = plot?.crop;
    if (!crop) return null;
    if (typeof crop.amount === "number") return crop.amount;
    const r = getCropYieldAmount({
      crop: crop.name,
      plot,
      game,
      createdAt: at(readyAt),
      prngArgs: { farmId, counter },
    });
    return r?.amount ?? null;
  });

export const predictFruit = (
  game: Game,
  patchId: string,
  _readyAt: number,
  farmId: number,
  counter: number,
): number | null =>
  SAFE(() => {
    const patch = game?.fruitPatches?.[patchId];
    const fruit = patch?.fruit;
    if (!fruit) return null;
    if (typeof fruit.amount === "number") return fruit.amount;
    const r = getFruitYield({
      game,
      name: fruit.name,
      fertiliser: patch.fertiliser?.name,
      prngArgs: { farmId, counter },
    });
    return r?.amount ?? null;
  });

export const predictGreenhouse = (
  game: Game,
  potId: string,
  readyAt: number,
  farmId: number,
  counter: number,
): number | null =>
  SAFE(() => {
    const pot = game?.greenhouse?.pots?.[potId];
    const plant = pot?.plant;
    if (!plant) return null;
    if (typeof plant.amount === "number") return plant.amount;
    const r = getGreenhouseCropYieldAmount({
      crop: plant.name,
      game,
      createdAt: at(readyAt),
      prngArgs: { farmId, counter },
      fertiliser: pot.fertiliser?.name,
    });
    return r?.amount ?? null;
  });

export const predictTree = (
  game: Game,
  treeId: string,
  _readyAt: number,
  farmId: number,
  counter: number,
): number | null =>
  SAFE(() => {
    const tree = game?.trees?.[treeId];
    if (!tree) return null;
    if (typeof tree.wood?.amount === "number") return tree.wood.amount;
    // The game keys prng by the per-variant tree name (Tree / Ancient Tree
    // / Sacred Tree), not the produced resource ("Wood"). Match it so the
    // chance rolls land on the same plot indices the player would see at
    // harvest time.
    const treeName = tree.name ?? "Tree";
    const r = getWoodDropAmount({
      game,
      tree,
      farmId,
      counter,
      itemId: itemIdOf(treeName),
    });
    return r ? toNumber(r.amount) : null;
  });

const ROCK_RESOURCE: Record<
  "stones" | "iron" | "gold" | "crimstones",
  {
    fn: (...args: unknown[]) => unknown;
    /** Default `rock.name` when the field isn't set on the rock — matches
     * what the game falls back to inside each handler. */
    fallbackRockName: string;
  }
> = {
  stones: { fn: getStoneDropAmount, fallbackRockName: "Stone Rock" },
  iron: { fn: getIronDropAmount, fallbackRockName: "Iron Rock" },
  gold: { fn: getGoldDropAmount, fallbackRockName: "Gold Rock" },
  crimstones: { fn: getCrimstoneDropAmount, fallbackRockName: "Crimstone Rock" },
};

const predictRock = (
  game: Game,
  field: "stones" | "iron" | "gold" | "crimstones",
  rockId: string,
  readyAt: number,
  farmId: number,
  counter: number,
): number | null =>
  SAFE(() => {
    const rock = game?.[field]?.[rockId];
    if (!rock) return null;
    if (typeof rock.stone?.amount === "number") return rock.stone.amount;
    const { fn, fallbackRockName } = ROCK_RESOURCE[field];
    // Per-variant itemId: a Reinforced Stone rock uses
    // KNOWN_IDS["Reinforced Stone Rock"], not KNOWN_IDS["Stone"]. Same
    // pattern the game's mine handlers use to seed prng.
    const rockName = rock.name ?? fallbackRockName;
    const r = (fn as (a: unknown) => { amount: unknown })({
      game,
      rock,
      createdAt: at(readyAt),
      id: rockId,
      farmId,
      counter,
      itemId: itemIdOf(rockName),
    });
    return r ? toNumber(r.amount) : null;
  });

export const predictStone = (
  g: Game,
  id: string,
  readyAt: number,
  farmId: number,
  counter: number,
) => predictRock(g, "stones", id, readyAt, farmId, counter);
export const predictIron = (
  g: Game,
  id: string,
  readyAt: number,
  farmId: number,
  counter: number,
) => predictRock(g, "iron", id, readyAt, farmId, counter);
export const predictGold = (
  g: Game,
  id: string,
  readyAt: number,
  farmId: number,
  counter: number,
) => predictRock(g, "gold", id, readyAt, farmId, counter);
export const predictCrimstone = (
  g: Game,
  id: string,
  readyAt: number,
  farmId: number,
  counter: number,
) => predictRock(g, "crimstones", id, readyAt, farmId, counter);

// Sunstone yield is a flat 1; no boosts and no chance-based logic.
export const predictSunstone = (_game: Game): number => 1;

export const predictOil = (game: Game, reserveId: string): number | null =>
  SAFE(() => {
    const reserve = game?.oilReserves?.[reserveId];
    if (!reserve) return null;
    // getOilDropAmount has no prng path.
    const r = getOilDropAmount(game, reserve);
    return r ? toNumber(r.amount) : null;
  });

export const predictLavaPit = (game: Game): number | null =>
  SAFE(() => {
    const r = getObsidianYield({ game });
    if (typeof r === "number") return r;
    if (r && typeof r === "object" && "amount" in r) return toNumber(r.amount);
    return null;
  });

export const predictBeehive = (game: Game, hiveId: string): number | null =>
  SAFE(() => {
    const hive = game?.beehives?.[hiveId];
    if (!hive) return null;
    // honey.produced is stored as elapsed-ms-equivalent; full hive == one
    // production cycle (DEFAULT_HONEY_PRODUCTION_TIME ≈ 24h). Cap at 1 (a
    // hive doesn't yield more than one full cycle).
    const DEFAULT_HONEY_PRODUCTION_TIME = 24 * HOUR_MS;
    const fraction = Math.min(
      1,
      (hive.honey?.produced ?? 0) / DEFAULT_HONEY_PRODUCTION_TIME,
    );
    const { multiplier } = getHoneyMultiplier(game);
    return fraction * multiplier;
  });

// Flowers: getFlowerAmount is unexported in harvestFlower.ts. The only
// non-chance boost is Legendary Shrine (+1 flat). We replicate that locally;
// chance bonuses (Humming Bird, Butterfly, etc.) are intentionally omitted.
export const predictFlower = (game: Game, bedId: string): number | null =>
  SAFE(() => {
    const bed = game?.flowers?.flowerBeds?.[bedId];
    const flower = bed?.flower;
    if (!flower) return null;
    if (typeof flower.amount === "number") return flower.amount;
    let amount = 1;
    if (isWearableActive({ name: "Legendary Shrine", game })) amount += 1;
    return amount;
  });

const PRIMARY_PRODUCE: Record<string, string> = {
  Chicken: "Egg",
  Cow: "Milk",
  Sheep: "Wool",
};

export const predictAnimalProduce = (
  game: Game,
  building: "henHouse" | "barn",
  animalId: string,
): { amount: number; resource: string } | null =>
  SAFE(() => {
    const animal = game?.[building]?.animals?.[animalId];
    if (!animal) return null;
    const resource = PRIMARY_PRODUCE[animal.type];
    if (!resource) return null;
    const r = getResourceDropAmount({
      game,
      animalType: animal.type,
      resource,
      baseAmount: 1,
      multiplier: animal.multiplier ?? 1,
      animal,
    });
    const amount = r ? toNumber(r.amount) : 1;
    return { amount, resource };
  });

export const predictSaltPerRake = (game: Game): number | null =>
  SAFE(() => {
    const r = getSaltYieldPerRake(game, Date.now());
    return r ? toNumber(r.saltYield) : null;
  });

/**
 * Salt node charges accrue continuously on the server but the API field
 * (`saltFarm.nodes[id].salt.storedCharges` / `.nextChargeAt`) is only
 * persisted on game-state mutations — it goes stale between syncs. The
 * game's UI side-steps this by re-running `syncSaltNode` against the
 * current time. We mirror that here so the count and next-charge timer
 * match what the player would see in-game right now.
 */
export const predictSaltNode = (
  game: Game,
  nodeId: string,
): {
  stored: number;
  max: number;
  nextChargeAt: number;
} | null =>
  SAFE(() => {
    const node = game?.saltFarm?.nodes?.[nodeId];
    if (!node) return null;
    const sculptureLevel =
      game?.sculptures?.["Salt Sculpture"]?.level ?? 0;
    const max = getMaxStoredSaltCharges(sculptureLevel);
    const { chargeGenerationTimeMs } = getSaltChargeGenerationTime({
      gameState: game,
    });
    const synced = syncSaltNode(node, Date.now(), {
      chargeIntervalMs: chargeGenerationTimeMs,
      maxCharges: max,
    });
    return {
      stored: synced.salt.storedCharges,
      max,
      nextChargeAt: synced.salt.nextChargeAt,
    };
  });

export const predictMushroom = (): number => 1;

// Crab traps: getCrustaceanAmount is unexported. The only non-chance bonus
// reachable without prngArgs is Crab House (+2). Pistol Shrimp is chance-only
// and is omitted from the prediction.
export const predictCrabTrap = (game: Game, trapId: string): number | null =>
  SAFE(() => {
    const spot = game?.crabTraps?.trapSpots?.[trapId];
    const trap = spot?.waterTrap;
    if (!trap) return null;
    const caught = trap.caught ?? {};
    const caughtName = Object.keys(caught)[0];
    const baseAmount = caughtName ? (caught[caughtName] ?? 1) : 1;
    let amount = baseAmount;
    if (isCollectibleBuilt({ name: "Crab House", game })) amount += 2;
    return amount;
  });

// Aging Shed: yield is base-amount (typically 1) doubled if Ager skill is set.
// We default baseAmount=1 since the rack entries don't carry a base in state.
export const predictAgingShed = (game: Game): number | null =>
  SAFE(() => {
    let amount = 1;
    if (game?.bumpkin?.skills?.["Ager"]) amount *= 2;
    return amount;
  });

// Crop Machine: getPackYieldAmount loops `pack.seeds` times advancing the
// counter on each iteration. We replicate that here so prng-based bonuses
// fire on the right per-seed slots, matching what the player will harvest.
export const predictCropMachinePack = (
  game: Game,
  machineId: string,
  packIndex: number,
  readyAt: number,
  farmId: number,
  counter: number,
): number | null =>
  SAFE(() => {
    const machine = (game?.buildings?.["Crop Machine"] ?? []).find(
      (m: { id?: string }, i: number) => (m?.id ?? `idx${i}`) === machineId,
    );
    const pack = machine?.queue?.[packIndex];
    if (!pack) return null;
    const seeds = pack.seeds ?? 1;
    const createdAt = at(readyAt);
    let totalYield = 0;
    for (let i = 0; i < seeds; i++) {
      const r = getCropYieldAmount({
        crop: pack.crop,
        game,
        createdAt,
        prngArgs: { farmId, counter: counter + i },
      });
      totalYield += r ? toNumber(r.amount) : 0;
    }
    return totalYield;
  });
