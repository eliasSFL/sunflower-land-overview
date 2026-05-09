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

// Honey production: a beehive's `honey.produced` counts up to 1 unit (1.0).
// Production rate depends on attached flowers; without flowers, no progress.
// We approximate full-from-zero as 24h — used only when we cannot infer
// attached-flower rate.
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
