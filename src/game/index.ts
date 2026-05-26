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
// Typed Object.entries / Object.keys — upstream's thin wrappers that
// preserve the `keyof T` and value types, so iterating
// `producing.items` / `recipe.outputs` (both
// `Partial<Record<InventoryItemName, …>>`) yields `[InventoryItemName,
// …]` instead of `[string, …]`.
export { getObjectEntries, getKeys } from "lib/object";
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
export {
  PATCH_FRUIT,
  PATCH_FRUIT_SEEDS,
  GREENHOUSE_FRUIT,
} from "features/game/types/fruits";
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
// Crab traps — `getCrustaceanAmount` boosts a base catch amount by
// trap-specific boosts (Crab House flat +2, Pistol Shrimp 20% PRNG +1).
// Caller passes `prngArgs` seeded by farmActivity[`${name} Caught`] so
// the Pistol Shrimp roll matches what the server will compute at
// collection time.
export { getCrustaceanAmount } from "features/game/events/landExpansion/collectWaterTrap";
// Animals — `getAnimalLevel` maps experience → level, `ANIMAL_RESOURCE_DROP`
// is the per-level base drop table, and `getResourceDropAmount` threads
// all boosts (collectibles, wearables, skills, Buds) onto a single
// resource for a given animal.
export { ANIMAL_RESOURCE_DROP } from "features/game/types/animals";
export {
  getAnimalLevel,
  getResourceDropAmount,
} from "features/game/lib/animals";
// Cooking + processing yield prediction. `getCookingAmount` takes an
// explicit counter so we can thread per-recipe PRNG sequences across
// the queue (Fiery Jackpot, Master Chef's Cleaver). Fish Market reads
// its counter straight from `farmActivity` and returns the boost list
// already itemised.
export { getCookingAmount } from "features/game/events/landExpansion/collectRecipe";
export { getProcessedResourceAmount } from "features/game/events/landExpansion/collectProcessedResource";
// Discriminator dictionaries for the cooking / processing recipe union.
// `name in COOKABLES` narrows `CookableName | ProcessedResource` →
// `CookableName`; `name in PROCESSED_RESOURCES` does the inverse. Used
// by the cooking-timer extractor.
export { COOKABLES } from "features/game/types/consumables";
export { PROCESSED_RESOURCES } from "features/game/types/processedFood";
// Per-building queue / capacity caps used by the IdlePanel to compute
// "X slots free". `hasVipAccess` gates the larger cap for cooking and
// fish processing; `getBoostedAnimalCapacity` accounts for skill /
// collectible / wearable bonuses on hen house / barn capacity.
export { MAX_COOKING_SLOTS } from "features/game/events/landExpansion/cook";
export { MAX_FISH_PROCESSING_SLOTS } from "features/game/events/landExpansion/processResource";
export { MAX_QUEUE_SIZE as MAX_CROP_MACHINE_QUEUE_SIZE } from "features/game/events/landExpansion/supplyCropMachine";
export {
  hasVipAccess,
  hasLifetimeFarmerBanner,
} from "features/game/lib/vipAccess";
export { getBoostedAnimalCapacity } from "features/game/events/landExpansion/buyAnimal";
export { getNextLoveAvailableAt } from "features/game/events/landExpansion/loveAnimal";
export { getMaxFermentationSlots } from "features/game/types/fermentation";
export { getMaxSpiceRackSlots } from "features/game/types/spiceRack";
export { getAgingSlotCount } from "features/game/types/aging";
// Composters — `rollWormAmount` deterministically predicts the
// worm yield at collect time (same PRNG seed the server uses), and
// `composterDetails` maps each composter to its worm type
// (Earthworm / Grub / Red Wiggler).
export { rollWormAmount } from "features/game/events/landExpansion/composterBait";
export {
  getCompostAmount,
  getReadyAt as getComposterReadyAt,
} from "features/game/events/landExpansion/startComposter";
export { composterDetails } from "features/game/types/composters";
// Aging shed — three sub-racks (aging / fermentation / spice). Recipe
// lookups give us the output item + duration for each job. Aged-fish
// jobs derive their output via the `Aged ${fishName}` template; we
// don't currently predict the Prime Aged PRNG flip.
export { getFermentationRecipe } from "features/game/types/fermentation";
export { getSpiceRackRecipe } from "features/game/types/spiceRack";
// Salt farm — these are deterministic helpers; never read salt.storedCharges
// or salt.nextChargeAt directly off the game state. Run the node through
// `materializeSaltRegen` first so accrued charges since the last server
// touch are realized against `now`.
export {
  materializeSaltRegen,
  getSaltChargeGenerationTime,
  getMaxStoredSaltCharges,
  getNextSaltChargeInSeconds,
  getSaltYieldPerRake,
  SALT_CHARGE_GENERATION_TIME,
  MAX_STORED_SALT_CHARGES_PER_NODE,
  BASE_SALT_YIELD,
} from "features/game/types/salt";
export {
  DEFAULT_HONEY_PRODUCTION_TIME,
  refreshBeehives,
  getCurrentHoneyProduced,
  getCurrentSpeed,
  getHoneyMultiplier,
} from "./beehives.ts";
// Bumpkin level helpers — wrappers around the canonical
// LEVEL_EXPERIENCE table upstream.
export {
  getBumpkinLevel,
  getExperienceToNextLevel,
  isMaxLevel,
  MAX_BUMPKIN_LEVEL,
} from "features/game/lib/level";
// Power skills — `getPowerSkills` returns the `power: true` entries of
// the revamp skill tree; `getSkillCooldown` applies the cooldown boost
// (Luna's Crescent halves it). The power-skills timer reads
// `bumpkin.previousPowerUseAt[name] + getSkillCooldown(...)` for the
// next-available timestamp, exactly as the in-game PowerSkills panel does.
export { getPowerSkills } from "features/game/types/bumpkinSkills";
export { getSkillCooldown } from "features/game/events/landExpansion/skillUsed";
// Deliveries — `getOrderSellPrice` handles boost-adjusted coin / SFL
// rewards, `generateDeliveryTickets` handles seasonal-ticket rewards
// (those aren't stored on the order; upstream computes them at claim
// time from the NPC + VIP + chapter boost items + Double Delivery
// calendar event). `getChapterTicket` tells us which token icon to
// render for the current season.
export {
  getOrderSellPrice,
  generateDeliveryTickets,
} from "features/game/events/landExpansion/deliver";
export { isTicketNPC } from "features/island/delivery/lib/delivery";
export { getChapterTicket } from "features/game/types/chapters";
export type { Order, Delivery } from "features/game/types/game";
// Floating Island ("Love Island") event. `getActiveFloatingIsland`
// returns the schedule window covering `now` (or undefined when the
// island isn't currently reachable); `hasClaimedPetalPrize` reports
// whether today's daily Bronze Love Box has already been claimed
// (UTC-day keyed, same comparison the in-game claim uses).
export { getActiveFloatingIsland } from "features/game/types/floatingIsland";
export { hasClaimedPetalPrize } from "features/game/events/landExpansion/claimPetalPrize";
// Pets. The overview reads live pet state from `state.pets.common`
// (common breeds) and `state.pets.nfts` (NFT pets). `getPetLevel` maps
// total experience → level/progress (the same quadratic the in-game pet
// panel uses); `getPetType` resolves the breed (common) or NFT trait
// type; `isPetNapping` / `isPetNeglected` mirror the two interaction
// gates in the feed reducer; `getPetRequestXP` is the per-food XP
// reward. `getPetFoodRequests` (from the feed reducer) narrows a pet's
// raw request list to the foods actually active at its level — we call
// it rather than re-deriving the level tiers. `getPetImage` returns the
// sprite URL for a pet: a bundled asset for common breeds, a
// CDN-rendered image for NFT pets, so we never composite trait layers
// ourselves.
export {
  getPetLevel,
  getPetType,
  isPetNapping,
  isPetNeglected,
  getPetRequestXP,
} from "features/game/types/pets";
export { getPetFoodRequests } from "features/game/events/pets/feedPet";
export { getPetImage } from "features/island/pets/lib/petShared";
// `isCollectibleBuilt` is the upstream placement check for a common
// pet (and any other collectible): true iff a ready PlacedItem exists
// in any of the placeable locations (farm, home, interior, level_one,
// petHouse). Matches `feedPet`'s gate for common pets.
export { isCollectibleBuilt } from "features/game/lib/collectibleBuilt";
// Discriminator for the `InventoryItemName | BumpkinItem` union — true
// when the name is a collectible (i.e. lives in `state.inventory`),
// false when it's a wearable (lives in `state.wardrobe`). Used by the
// delivery row to look up the player's "have" count in the right place.
export { isCollectible } from "features/game/events/landExpansion/garbageSold";
// NPC avatar pieces. `NPC_WEARABLES` is the canonical equipped-parts
// map upstream uses everywhere it renders an NPC; `getAnimatedWebpUrl`
// builds the CDN URL the in-game `NPCIcon` component points at. Pair
// them to render the same "idle-small" bumpkin animation our overview
// shows for each delivery row.
export { NPC_WEARABLES } from "lib/npcs";
export type { NPCName } from "lib/npcs";
export { getAnimatedWebpUrl } from "features/world/lib/animations";

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
  AnimalLevel,
  AnimalState,
  AnimalType,
  BuildingName,
  BuildingProduct,
  CookableName,
  CookingBuildingName,
  CompostBuilding,
  ComposterName,
  PlacedItem,
  ProcessedResource,
  ProcessingBuildingName,
  AgingShed,
  AgingRackSlot,
  FermentationJob,
  SpiceRackJob,
  FermentationRecipeName,
  SpiceRackRecipeName,
  FishName,
  AgedFishName,
  PrimeAgedFishName,
  // Crab traps
  CrabTrap,
  WaterTrap,
  WaterTrapName,
  CrustaceanName,
  CrustaceanChum,
  CraftingQueueItem,
  // Composter worm name + the corresponding farmActivity counter key.
  Worm,
  // Activity counter keys (template-literal union covering every
  // `${X} Cooked` / `${X} Processed` / `${Worm} Collected` etc).
  FarmActivityName,
  // AOE bookkeeping for resource yield batching.
  AOE,
  // Boost union + critical-drop callback arg
  BoostName,
  CriticalHitName,
  // Inventory key union (collectibles + tools + tickets + ...)
  InventoryItemName,
  // Island progression + faction pledge
  IslandType,
  FactionName,
  // Power-skill name union — keys of `bumpkin.previousPowerUseAt` and
  // the `power: true` entries returned by getPowerSkills. `BumpkinSkillRevamp`
  // is the structural skill type (its `requirements.cooldown` is optional),
  // used to read cooldowns off the otherwise-narrow getPowerSkills() union.
  BumpkinRevampSkillName,
  BumpkinSkillRevamp,
  // Wearable name union — Crafting Box queues these alongside collectibles.
  BumpkinItem,
  // Resource node-name unions (Tree / Rock variants)
  TreeName,
  RockName,
  // Compost names — plot fertiliser vs. greenhouse fertiliser differ
  FruitCompostName,
  CropCompostName,
  GreenhouseCompostName,
  // Pets — `Pet`/`PetNFT` are the per-pet records on `state.pets`;
  // `PetType` is the breed (common) or NFT trait type.
  Pet,
  PetNFT,
  Pets,
  PetName,
  PetNFTName,
  PetType,
  CommonPetType,
  PetNFTType,
} from "./types.ts";
export { TEAM_USERNAMES, MANAGER_IDS } from "lib/access";
