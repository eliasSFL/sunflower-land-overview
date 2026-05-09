// Minimal slice of the GameState we read for timers.
// We intentionally type only what we touch — the real shape is much larger.

export type CropPlot = {
  crop?: { name: string; plantedAt: number; amount?: number };
};

export type FruitPatch = {
  fruit?: {
    name: string;
    plantedAt: number;
    amount?: number;
    harvestsLeft?: number;
  };
};

export type FlowerBed = {
  flower?: { name: string; plantedAt: number; amount?: number };
};

export type BuildingProduct = {
  name: string;
  amount?: number;
  readyAt: number;
  startedAt?: number;
};

export type BuildingProduce = {
  name: string;
  amount?: number;
  readyAt?: number;
};

export type PlacedBuilding = {
  id?: string;
  readyAt?: number;
  createdAt?: number;
  crafting?: BuildingProduct[];
  producing?: BuildingProduce;
  oil?: number;
  oilTimeRemaining?: number;
};

export type Animal = {
  id: string;
  type: string;
  state: string;
  awakeAt: number;
  asleepAt: number;
};

export type Beehive = {
  honey: { updatedAt: number; produced: number };
};

export type GreenhouseSlot = {
  plant?: { name: string; plantedAt: number; amount?: number };
};

export type Tree = {
  wood: { choppedAt: number };
};

export type Rock = {
  stone: { minedAt: number };
};

export type OilReserve = {
  oil: { drilledAt: number };
};

export type Mushrooms = {
  spawnedAt?: number;
  magicSpawnedAt?: number;
};

export type AgingJob = {
  id: string;
  recipe?: string;
  fish?: string;
  readyAt: number;
};

export type AgingShed = {
  racks?: {
    aging?: AgingJob[];
    fermentation?: AgingJob[];
    spice?: AgingJob[];
  };
};

export type LavaPit = {
  startedAt?: number;
  readyAt?: number;
  collectedAt?: number;
};

export type CraftingQueueItem = {
  readyAt?: number;
  collectible?: { collectible?: string; wearable?: string } | string;
  wearable?: string;
};

export type CraftingBox = {
  status?: string;
  queue?: CraftingQueueItem[];
  readyAt?: number;
};

export type ExpansionConstruction = {
  readyAt?: number;
};

export type WaterTrapSpot = {
  waterTrap?: {
    type: string;
    placedAt: number;
    readyAt: number;
    /** Crustaceans the trap will yield when collected. Determined at place
     * time, so it's safe to read for the timer label. */
    caught?: Record<string, number>;
  };
};

export type CrabTrap = {
  trapSpots?: Record<string, WaterTrapSpot>;
};

export type DailyRewards = {
  chest?: { collectedAt?: number };
};

export type GameState = {
  crops?: Record<string, CropPlot>;
  fruitPatches?: Record<string, FruitPatch>;
  flowers?: { flowerBeds?: Record<string, FlowerBed> };
  buildings?: Record<string, PlacedBuilding[]>;
  henHouse?: { animals?: Record<string, Animal> };
  barn?: { animals?: Record<string, Animal> };
  beehives?: Record<string, Beehive>;
  greenhouse?: { pots?: Record<string, GreenhouseSlot> };
  bounties?: {
    requests?: Array<{ id: string; name?: string; expiresAt?: number }>;
  };
  delivery?: {
    orders?: Array<{
      id: string;
      from?: string;
      readyAt?: number;
      completedAt?: number;
      expiresAt?: number;
    }>;
  };
  dailyRewards?: DailyRewards;
  desert?: {
    digging?: {
      grid?: unknown;
      patterns?: unknown;
    };
  };
  trees?: Record<string, Tree>;
  stones?: Record<string, Rock>;
  iron?: Record<string, Rock>;
  gold?: Record<string, Rock>;
  crimstones?: Record<string, Rock>;
  sunstones?: Record<string, Rock>;
  oilReserves?: Record<string, OilReserve>;
  mushrooms?: Mushrooms;
  agingShed?: AgingShed;
  lavaPits?: Record<string, LavaPit>;
  craftingBox?: CraftingBox;
  expansionConstruction?: ExpansionConstruction;
  crabTraps?: CrabTrap;
};
