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
  farmActivity?: Record<string, number>;
  island?: { type?: string };
  season?: { season?: string };
  // The full GameState has many more fields (animals, beehives, deliveries,
  // bounties, etc.). Each timer category extends this type with the slice
  // it consumes — see src/game/types.ts grow alongside src/timers/.
};
