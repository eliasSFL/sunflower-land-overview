// Narrowed shape of the game state covering only what the overview reads.
// Authoritative shape lives in sunflower-land/src/features/game/types/game.ts;
// drift will surface when src/game/yields.ts can't satisfy the signatures
// it imports.

export type CropName =
  | "Sunflower"
  | "Potato"
  | "Pumpkin"
  | "Carrot"
  | "Cabbage"
  | "Soybean"
  | "Beetroot"
  | "Cauliflower"
  | "Parsnip"
  | "Eggplant"
  | "Corn"
  | "Radish"
  | "Wheat"
  | "Kale"
  | "Barley"
  | "Rhubarb"
  | "Zucchini"
  | "Yam"
  | "Broccoli"
  | "Pepper"
  | "Onion"
  | "Turnip"
  | "Artichoke";

export type CropPlot = {
  x: number;
  y: number;
  crop?: {
    id?: string;
    name: CropName;
    plantedAt: number;
    amount?: number;
    boostedTime?: number;
    fertiliser?: { name: string; fertilisedAt: number };
  };
  fertiliser?: { name: string; fertilisedAt: number };
  beeSwarm?: unknown;
  createdAt: number;
};

export type PatchFruitName =
  | "Apple"
  | "Blueberry"
  | "Orange"
  | "Banana"
  | "Tomato"
  | "Lemon"
  | "Celestine"
  | "Lunara"
  | "Duskberry";

export type PlantedFruit = {
  name: PatchFruitName;
  plantedAt: number;
  // 0 once the patch is fully exhausted and needs re-seeding.
  harvestsLeft: number;
  // 0 before the first harvest, then the timestamp of the most recent
  // harvest. Readiness restarts from this when set (see
  // sunflower-land/src/features/game/events/landExpansion/fruitPatchReadiness.ts).
  harvestedAt: number;
  amount?: number;
  fertiliser?: { name: string; fertilisedAt: number };
};

export type FruitPatch = {
  fruit?: PlantedFruit;
  fertiliser?: { name: string; fertilisedAt: number };
  createdAt?: number;
  x?: number;
  y?: number;
};

export type GreenhousePlantName = "Rice" | "Olive" | "Grape";

export type GreenhousePlant = {
  name: GreenhousePlantName;
  plantedAt: number;
  amount?: number;
};

export type GreenhousePot = {
  plant?: GreenhousePlant;
  fertiliser?: { name: string; fertilisedAt: number };
};

export type Greenhouse = {
  oil: number;
  pots: Record<string, GreenhousePot>;
};

export type CropMachineQueueItem = {
  crop: CropName;
  seeds: number;
  growTimeRemaining: number;
  totalGrowTime: number;
  startTime?: number;
  // Set when the pack has finished growing and pre-computed yield is
  // stored. Use directly when present.
  amount?: number;
  // The deadline at which oil runs out mid-grow; only present when the
  // pack will pause unless more oil is added.
  growsUntil?: number;
  // The wall-clock time the pack will be ready; unset before the pack
  // starts processing.
  readyAt?: number;
};

export type CropMachineBuilding = {
  id?: string;
  createdAt: number;
  readyAt?: number;
  queue?: CropMachineQueueItem[];
  unallocatedOilTime?: number;
};

// FlowerName from the submodule is a long union of every variant ("Red
// Pansy", "Yellow Carnation", etc.). Keeping it as `string` here avoids
// duplicating that ~80-entry union; the runtime invariant is that
// `state.flowers.flowerBeds[*].flower.name` is always a valid key in the
// submodule's FLOWERS table, which getFlowerGrowSeconds relies on.
export type FlowerName = string;

export type PlantedFlower = {
  name: FlowerName;
  plantedAt: number;
  amount?: number;
  // Map of boost-name → whether the random crit succeeded at plant
  // time. Determines which collectible/skill boosts actually fire when
  // this specific flower is harvested. See harvestFlower.ts:getFlowerAmount.
  criticalHit?: Record<string, number>;
};

export type FlowerBed = {
  flower?: PlantedFlower;
  createdAt: number;
  removedAt?: number;
  x?: number;
  y?: number;
};

export type FlowersState = {
  flowerBeds: Record<string, FlowerBed>;
  discovered?: Record<string, string[]>;
};

// Mirrors sunflower-land/src/features/game/types/game.ts:Beehive. Honey
// progresses deterministically from `honey.produced` at `honey.updatedAt`,
// and each attached flower contributes `(end - start) * rate` honey while
// the flower's [attachedAt, attachedUntil] window is active.
export type AttachedFlower = {
  id: string;
  attachedAt: number;
  attachedUntil: number;
  rate?: number;
};

export type Beehive = {
  swarm: boolean;
  honey: {
    updatedAt: number;
    produced: number;
  };
  flowers: AttachedFlower[];
  removedAt?: number;
  x?: number;
  y?: number;
};

export type Beehives = Record<string, Beehive>;

export type GameState = {
  id?: number;
  bumpkin?: {
    skills?: Record<string, number>;
    equipped?: Record<string, string>;
    achievements?: Record<string, number>;
    activity?: Record<string, number>;
  };
  inventory?: Record<string, string | number | undefined>;
  collectibles?: Record<string, Array<{ id?: string; createdAt: number }>>;
  home?: { collectibles?: Record<string, Array<{ id?: string; createdAt: number }>> };
  buildings?: Record<string, Array<{ id?: string; createdAt: number; readyAt?: number }>>;
  crops?: Record<string, CropPlot>;
  fruitPatches?: Record<string, FruitPatch>;
  greenhouse?: Greenhouse;
  flowers?: FlowersState;
  beehives?: Beehives;
  farmActivity?: Record<string, number>;
  island?: { type?: string };
  season?: { season?: string };
  // The full GameState has many more fields (animals, beehives, deliveries,
  // bounties, etc.). Each timer category extends this type with the slice
  // it consumes — see src/game/types.ts grow alongside src/timers/.
};
