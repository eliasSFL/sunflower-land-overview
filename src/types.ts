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
  dailyRewards?: {
    chest?: { collectedAt?: number; available?: { openedAt?: number } };
  };
  desert?: {
    digging?: {
      grid?: unknown;
      patterns?: unknown;
    };
  };
};
