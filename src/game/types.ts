// All types come from the sunflower-land submodule's real definitions.
// `tsconfig.sunflower-land.json` builds .d.ts files for those modules
// (with `noCheck` to skip its laxer-than-ours strictness), and our
// `tsconfig.app.json` references that project + maps `features/*` etc.
// via `paths`. So when something changes upstream, our compile breaks
// here first.

export type { CropName } from "features/game/types/crops";
export type {
  PatchFruitName,
  GreenHouseFruitName,
} from "features/game/types/fruits";
export type { FlowerName } from "features/game/types/flowers";
export type { GreenHouseCropName } from "features/game/types/crops";

export type {
  // Crops
  CropPlot,
  PlantedCrop,
  // Patch fruit
  PlantedFruit,
  FruitPatch,
  // Greenhouse
  GreenhousePlant,
  GreenhousePot,
  // Crop machine
  CropMachineQueueItem,
  CropMachineBuilding,
  // Flowers
  FlowerBed,
  FlowerBeds,
  AttachedFlower,
  // Beehives
  Beehive,
  Beehives,
  // Resources
  Wood,
  Tree,
  Stone,
  Rock,
  FiniteResource,
  Oil,
  OilReserve,
  // Lava pits
  LavaPit,
  // Animals
  Animal,
  AnimalBuilding,
  AnimalResource,
  AnimalState,

  // Cooking / processing buildings
  BuildingProduct,
  PlacedItem,
  // Composters
  CompostBuilding,
  // Crafting box
  CraftingQueueItem,
  // Root
  GameState,
} from "features/game/types/game";

export type { AnimalType, AnimalLevel } from "features/game/types/animals";
export type {
  CookingBuildingName,
  ProcessingBuildingName,
  BuildingName,
} from "features/game/types/buildings";
export type { CookableName } from "features/game/types/consumables";
export type { ProcessedResource } from "features/game/types/processedFood";
export type { ComposterName } from "features/game/types/composters";
export type {
  AgingShed,
  AgingRackSlot,
  FermentationJob,
  SpiceRackJob,
} from "features/game/lib/agingShed";
export type { FermentationRecipeName } from "features/game/types/fermentation";
export type { SpiceRackRecipeName } from "features/game/types/spiceRack";
export type { FishName } from "features/game/types/fishing";

// Unions / aliases we use locally that aren't a single upstream type.
import type { GreenHouseCropName } from "features/game/types/crops";
import type { GreenHouseFruitName } from "features/game/types/fruits";
import type { GameState } from "features/game/types/game";

export type GreenhousePlantName = GreenHouseCropName | GreenHouseFruitName;

// GameState slices we used to type locally. The shape comes from the
// real GameState — exposing them as named types keeps callsites tidy.
export type Greenhouse = GameState["greenhouse"];
export type FlowersState = GameState["flowers"];

// PlantedFruit was historically exposed as a top-level type; mirror the
// submodule's shape for that key too.
export type { PlantedFlower } from "features/game/types/game";

// Salt farm.
export type {
  SaltNode,
  SaltNodes,
  SaltFarm,
  Salt,
} from "features/game/types/salt";
