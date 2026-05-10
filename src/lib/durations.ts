// Harvest / plant durations in seconds.
// Sourced from sunflower-land game constants (CROPS, PATCH_FRUIT_SEEDS,
// GREENHOUSE_*, FLOWER_SEEDS). Player boosts (skills, wearables, collectibles)
// can shorten these — values shown are the unboosted base.

export const CROP_SECONDS: Record<string, number> = {
  Sunflower: 1 * 60,
  Potato: 5 * 60,
  Rhubarb: 10 * 60,
  Pumpkin: 30 * 60,
  Zucchini: 30 * 60,
  Carrot: 60 * 60,
  Yam: 60 * 60,
  Cabbage: 2 * 60 * 60,
  Broccoli: 2 * 60 * 60,
  Soybean: 3 * 60 * 60,
  Beetroot: 2.8 * 60 * 60, // historical 2.8h then 4h depending on chapter; we use base
  Pepper: 4 * 60 * 60,
  Cauliflower: 8 * 60 * 60,
  Parsnip: 12 * 60 * 60,
  Eggplant: 16 * 60 * 60,
  Corn: 20 * 60 * 60,
  Onion: 20 * 60 * 60,
  Radish: 24 * 60 * 60,
  Wheat: 24 * 60 * 60,
  Turnip: 24 * 60 * 60,
  Kale: 36 * 60 * 60,
  Artichoke: 36 * 60 * 60,
  Barley: 48 * 60 * 60,
};

export const GREENHOUSE_CROP_SECONDS: Record<string, number> = {
  Rice: 32 * 60 * 60,
  Olive: 44 * 60 * 60,
};

export const PATCH_FRUIT_SECONDS: Record<string, number> = {
  Tomato: 2 * 60 * 60,
  Lemon: 4 * 60 * 60,
  Blueberry: 6 * 60 * 60,
  Orange: 8 * 60 * 60,
  Apple: 12 * 60 * 60,
  Banana: 12 * 60 * 60,
  Celestine: 6 * 60 * 60,
  Lunara: 12 * 60 * 60,
  Duskberry: 24 * 60 * 60,
};

export const GREENHOUSE_FRUIT_SECONDS: Record<string, number> = {
  Grape: 12 * 60 * 60,
};

// Honey production: a beehive's `honey.produced` is stored in milliseconds
// (elapsed-ms-equivalent). A full hive is HONEY_FULL_SECONDS × 1000 ms — i.e.
// one complete production cycle equals 24 hours of attached-flower time at
// 1× rate. Production only accrues while a flower is attached; rate boosts
// (Queen Bee, Beekeeper Hat, etc.) speed up the per-flower contribution.
export const HONEY_FULL_SECONDS = 24 * 60 * 60;

// Resource recovery times (seconds) — sourced from
// sunflower-land/src/features/game/lib/constants.ts. Boosts (e.g. axes, faction
// buffs) can shorten these in-game; values shown are the unboosted base.
export const TREE_RECOVERY_SECONDS = 2 * 60 * 60;
export const STONE_RECOVERY_SECONDS = 4 * 60 * 60;
export const IRON_RECOVERY_SECONDS = 8 * 60 * 60;
export const GOLD_RECOVERY_SECONDS = 24 * 60 * 60;
export const CRIMSTONE_RECOVERY_SECONDS = 24 * 60 * 60;
export const SUNSTONE_RECOVERY_SECONDS = 3 * 24 * 60 * 60;
export const OIL_RESERVE_RECOVERY_SECONDS = 20 * 60 * 60;

// Mushroom spawn cycle — both regular and magic mushrooms use the same
// 16-hour interval (sunflower-land-api populateFarm.ts MUSHROOM_SPAWN_MS).
export const MUSHROOM_SPAWN_SECONDS = 16 * 60 * 60;

// Salt nodes accumulate charges over time. Source:
// sunflower-land-api/src/domain/game/types/salt.ts
//   SALT_CHARGE_GENERATION_TIME = 7 hours per charge (base, no boosts)
//   MAX_STORED_SALT_CHARGES_PER_NODE = 3 base, +1 at Salt Sculpture lvl 3,
//   +1 again at level 6.
export const SALT_CHARGE_GENERATION_SECONDS = 7 * 60 * 60;
export const SALT_BASE_MAX_CHARGES = 3;

/**
 * Mirror of getMaxStoredSaltCharges in salt.ts. Pure data here so we don't
 * need to import the SFL game lib.
 */
export function getMaxSaltCharges(sculptureLevel: number): number {
  let max = SALT_BASE_MAX_CHARGES;
  if (sculptureLevel >= 3) max += 1;
  if (sculptureLevel >= 6) max += 1;
  return max;
}

// Flower seed plant times (seconds). The flower bed stores the produced
// flower name, which we map back to its seed family below to derive the
// duration. Source: FLOWER_SEEDS in sunflower-land's flowers.ts.
const ONE_DAY_SECONDS = 24 * 60 * 60;
const SUNPETAL_SECONDS = 1 * ONE_DAY_SECONDS;
const BLOOM_SECONDS = 2 * ONE_DAY_SECONDS;
const LILY_SECONDS = 5 * ONE_DAY_SECONDS;
const EDELWEISS_SECONDS = 3 * ONE_DAY_SECONDS;
const GLADIOLUS_SECONDS = 3 * ONE_DAY_SECONDS;
const LAVENDER_SECONDS = 3 * ONE_DAY_SECONDS;
const CLOVER_SECONDS = 3 * ONE_DAY_SECONDS;

export const FLOWER_SECONDS: Record<string, number> = {
  // Sunpetal — 1 day
  "Red Pansy": SUNPETAL_SECONDS,
  "Yellow Pansy": SUNPETAL_SECONDS,
  "Purple Pansy": SUNPETAL_SECONDS,
  "White Pansy": SUNPETAL_SECONDS,
  "Blue Pansy": SUNPETAL_SECONDS,
  "Red Cosmos": SUNPETAL_SECONDS,
  "Yellow Cosmos": SUNPETAL_SECONDS,
  "Purple Cosmos": SUNPETAL_SECONDS,
  "White Cosmos": SUNPETAL_SECONDS,
  "Blue Cosmos": SUNPETAL_SECONDS,
  "Prism Petal": SUNPETAL_SECONDS,
  // Bloom — 2 days
  "Red Balloon Flower": BLOOM_SECONDS,
  "Yellow Balloon Flower": BLOOM_SECONDS,
  "Purple Balloon Flower": BLOOM_SECONDS,
  "White Balloon Flower": BLOOM_SECONDS,
  "Blue Balloon Flower": BLOOM_SECONDS,
  "Red Daffodil": BLOOM_SECONDS,
  "Yellow Daffodil": BLOOM_SECONDS,
  "Purple Daffodil": BLOOM_SECONDS,
  "White Daffodil": BLOOM_SECONDS,
  "Blue Daffodil": BLOOM_SECONDS,
  "Celestial Frostbloom": BLOOM_SECONDS,
  // Lily — 5 days
  "Red Carnation": LILY_SECONDS,
  "Yellow Carnation": LILY_SECONDS,
  "Purple Carnation": LILY_SECONDS,
  "White Carnation": LILY_SECONDS,
  "Blue Carnation": LILY_SECONDS,
  "Red Lotus": LILY_SECONDS,
  "Yellow Lotus": LILY_SECONDS,
  "Purple Lotus": LILY_SECONDS,
  "White Lotus": LILY_SECONDS,
  "Blue Lotus": LILY_SECONDS,
  "Primula Enigma": LILY_SECONDS,
  // Edelweiss — 3 days
  "Red Edelweiss": EDELWEISS_SECONDS,
  "Yellow Edelweiss": EDELWEISS_SECONDS,
  "Purple Edelweiss": EDELWEISS_SECONDS,
  "White Edelweiss": EDELWEISS_SECONDS,
  "Blue Edelweiss": EDELWEISS_SECONDS,
  // Gladiolus — 3 days
  "Red Gladiolus": GLADIOLUS_SECONDS,
  "Yellow Gladiolus": GLADIOLUS_SECONDS,
  "Purple Gladiolus": GLADIOLUS_SECONDS,
  "White Gladiolus": GLADIOLUS_SECONDS,
  "Blue Gladiolus": GLADIOLUS_SECONDS,
  // Lavender — 3 days
  "Red Lavender": LAVENDER_SECONDS,
  "Yellow Lavender": LAVENDER_SECONDS,
  "Purple Lavender": LAVENDER_SECONDS,
  "White Lavender": LAVENDER_SECONDS,
  "Blue Lavender": LAVENDER_SECONDS,
  // Clover — 3 days
  "Red Clover": CLOVER_SECONDS,
  "Yellow Clover": CLOVER_SECONDS,
  "Purple Clover": CLOVER_SECONDS,
  "White Clover": CLOVER_SECONDS,
  "Blue Clover": CLOVER_SECONDS,
};
