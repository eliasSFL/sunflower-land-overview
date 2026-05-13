// Public surface of the submodule boundary. Every other module in the
// overview imports from here, never directly from "features/..." or
// "sunflower-land/..." paths. Re-exports are explicit (not export *) so
// upstream signature changes fail to compile here, not 12 callsites away.

export {
  getCropYieldAmount,
  getPatchFruitYield,
  getGreenhouseYield,
  getCropMachinePackYield,
  getWoodYield,
  getStoneYield,
  getIronYield,
  getGoldYield,
  getCrimstoneYield,
  getOilYield,
  type CropYieldArgs,
  type PatchFruitYieldArgs,
  type GreenhouseYieldArgs,
  type CropMachinePackYieldArgs,
  type WoodYieldArgs,
  type StoneYieldArgs,
  type IronYieldArgs,
  type GoldYieldArgs,
  type CrimstoneYieldArgs,
  type OilYieldArgs,
} from "./yields.ts";
export {
  batchCropYields,
  batchPatchFruitYields,
  batchGreenhouseYields,
  batchWoodYields,
  batchStoneYields,
  batchIronYields,
  batchGoldYields,
  batchCrimstoneYields,
  batchSunstoneYields,
  batchOilYields,
} from "./batch-yields.ts";
export { getItemIcon, getBoostIcon, getBoostLabel } from "./icons.ts";
// Hydrates the raw API payload into a GameState — wraps inventory /
// balance / stock fields in Decimal so upstream helpers that call
// `.gt(0)` (e.g. animal boost gates on "Barn Manager") work. The API
// response itself ships plain numbers.
export { makeGame } from "features/game/lib/transforms";

// Pure passthroughs from the submodule. Re-exporting keeps timer files
// inside the boundary rule (only src/game/** may import from features/*).
export { FLOWERS, FLOWER_SEEDS } from "features/game/types/flowers";
export { getFlowerAmount } from "features/game/events/landExpansion/harvestFlower";
export { CROPS, GREENHOUSE_CROPS } from "features/game/types/crops";
export { PATCH_FRUIT, PATCH_FRUIT_SEEDS } from "features/game/types/fruits";
export { GREENHOUSE_CROP_TIME_SECONDS } from "features/game/events/landExpansion/harvestGreenHouse";
export {
  TREE_RECOVERY_TIME,
  STONE_RECOVERY_TIME,
  IRON_RECOVERY_TIME,
  GOLD_RECOVERY_TIME,
  CRIMSTONE_RECOVERY_TIME,
  SUNSTONE_RECOVERY_TIME,
} from "features/game/lib/constants";
export { OIL_RESERVE_RECOVERY_TIME } from "features/game/events/landExpansion/drillOilReserve";
// Lava pits — `getLavaPitTime` returns the boost-scaled production time
// (Obsidian Necklace, Magma Stone); `getObsidianYield` returns the per-
// collection obsidian amount plus the boosts that contributed to it.
export {
  LAVA_PIT_TIME,
  getLavaPitTime,
} from "features/game/events/landExpansion/startLavaPit";
export { getObsidianYield } from "features/game/events/landExpansion/collectLavaPit";
// Animals — `getAnimalLevel` maps experience → level, `ANIMAL_RESOURCE_DROP`
// is the per-level base drop table, and `getResourceDropAmount` threads
// all boosts (collectibles, wearables, skills, Buds) onto a single
// resource for a given animal.
export { ANIMAL_RESOURCE_DROP } from "features/game/types/animals";
export {
  getAnimalLevel,
  getResourceDropAmount,
} from "features/game/lib/animals";
// Salt farm — these are deterministic helpers; never read salt.storedCharges
// or salt.nextChargeAt directly off the game state. Run the node through
// `materializeSaltRegen` first so accrued charges since the last server
// touch are realized against `now`.
export {
  materializeSaltRegen,
  getSaltChargeGenerationTime,
  getMaxStoredSaltCharges,
  getNextSaltChargeInSeconds,
  SALT_CHARGE_GENERATION_TIME,
  MAX_STORED_SALT_CHARGES_PER_NODE,
} from "features/game/types/salt";
export {
  DEFAULT_HONEY_PRODUCTION_TIME,
  refreshBeehives,
  getCurrentHoneyProduced,
  getCurrentSpeed,
  getHoneyMultiplier,
} from "./beehives.ts";
export type {
  GameState,
  CropName,
  CropPlot,
  PatchFruitName,
  PlantedFruit,
  FruitPatch,
  GreenhousePlantName,
  GreenhousePlant,
  GreenhousePot,
  Greenhouse,
  CropMachineQueueItem,
  CropMachineBuilding,
  FlowerName,
  PlantedFlower,
  FlowerBed,
  FlowersState,
  AttachedFlower,
  Beehive,
  Beehives,
  Wood,
  Tree,
  Stone,
  Rock,
  FiniteResource,
  Oil,
  OilReserve,
  SaltNode,
  SaltNodes,
  SaltFarm,
  Salt,
  LavaPit,
  Animal,
  AnimalBuilding,
  AnimalResource,
  AnimalState,
  AnimalType,
} from "./types.ts";
