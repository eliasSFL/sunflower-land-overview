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
  TreeName,
  RockName,
  ResourceName,
  CommodityName,
} from "features/game/types/resources";
export type {
  FruitCompostName,
  CropCompostName,
  GreenhouseCompostName,
} from "features/game/types/composters";

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
  // Crab traps — `CrabTrap` is the per-farm container
  // (`state.crabTraps`) holding a map of trap spots; each spot can hold
  // one `WaterTrap`, which tracks the placed pot type, chum, readyAt,
  // and the crustacean it will yield.
  CrabTrap,
  WaterTrap,
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
  // Boost / critical-hit unions
  BoostName,
  CriticalHitName,
  // Inventory key union
  InventoryItemName,
  // AOE bookkeeping returned by upstream yield helpers, threaded
  // through batch loops so an AOE that fired on plot N can't fire
  // again on plot N+1.
  AOE,
  // Desert digging — `Desert` is the `state.desert` slice; `DugHole`
  // is a single revealed hole (x/y on the 10×10 grid + the revealed
  // `items`); `StreakReward` tracks the daily completion streak.
  Desert,
  DugHole,
  StreakReward,
} from "features/game/types/game";

// Desert digging formations — `DiggingFormationName` keys both today's
// `digging.patterns` and `DIGGING_FORMATIONS`; `DiggingFormation` is the
// relative-plot shape of a single formation.
export type {
  DiggingFormationName,
  DiggingFormation,
} from "features/game/types/desert";

export type { AnimalType, AnimalLevel } from "features/game/types/animals";
export type { BumpkinItem } from "features/game/types/bumpkin";
// Island progression tier (basic/spring/desert/volcano) and faction
// pledge — surfaced on the BumpkinSummaryPanel chips.
export type { IslandType, FactionName } from "features/game/types/game";
export type {
  CookingBuildingName,
  ProcessingBuildingName,
  BuildingName,
} from "features/game/types/buildings";
export type { CookableName } from "features/game/types/consumables";
export type { ProcessedResource } from "features/game/types/processedFood";
export type { ComposterName, Worm } from "features/game/types/composters";
export type {
  AgingShed,
  AgingRackSlot,
  FermentationJob,
  SpiceRackJob,
} from "features/game/lib/agingShed";
export type { FermentationRecipeName } from "features/game/types/fermentation";
export type { SpiceRackRecipeName } from "features/game/types/spiceRack";
export type {
  FishName,
  AgedFishName,
  PrimeAgedFishName,
} from "features/game/types/fishing";
export type {
  CrustaceanName,
  CrustaceanChum,
  WaterTrapName,
} from "features/game/types/crustaceans";
export type { FarmActivityName } from "features/game/types/farmActivity";
// Unions / aliases we use locally that aren't a single upstream type.
import type { GreenHouseCropName } from "features/game/types/crops";
import type { GreenHouseFruitName } from "features/game/types/fruits";
import type { GameState } from "features/game/types/game";
// BoostName subtypes — each branch of the BoostName union has its own
// dictionary (CALENDAR_EVENT_ICONS, BUMPKIN_REVAMP_SKILL_TREE, …) so
// the icon resolver narrows to these to look up images.
export type {
  BumpkinRevampSkillName,
  BumpkinSkillRevamp,
} from "features/game/types/bumpkinSkills";
export type { BudNFTName } from "features/game/types/marketplace";
export type { SeasonalEventName } from "features/game/types/calendar";
// Social farming — `MonumentName` keys both `villageProjects` and
// `REQUIRED_CHEERS`; `SocialFarming` is the slice of GameState that
// `VillageProjectsPanel` and the social-points rows on
// `BumpkinSummaryPanel` read from.
export type { MonumentName } from "features/game/types/monuments";
export type { SocialFarming } from "features/game/types/game";

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

// Pets — `Pet` (common breed) and `PetNFT` (tokenised) are the per-pet
// records held on `state.pets.common` / `state.pets.nfts`; `Pets` is the
// container. `PetType` covers both common breeds (Dog, Cat, …) and NFT
// trait types (Dragon, Phoenix, …).
export type {
  Pet,
  PetNFT,
  Pets,
  PetName,
  PetNFTName,
  PetType,
  CommonPetType,
  PetNFTType,
} from "features/game/types/pets";
