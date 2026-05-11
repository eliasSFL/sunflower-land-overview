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
export { getItemIcon, getBannerUrl } from "./icons.ts";
export { getFlowerGrowSeconds, getFlowerYield } from "./flowers.ts";
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
} from "./types.ts";
