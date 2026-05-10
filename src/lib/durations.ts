// Display-side duration constants. Duplicated from
// sunflower-land/src/features/game/types/crops.ts (and siblings) so the UI
// doesn't break on internal refactors that don't change game semantics. A
// CI test under src/game/__tests__/ asserts these match the submodule's
// values — the duplication stays cheap.

import type {
  CropName,
  GreenhousePlantName,
  PatchFruitName,
} from "../game/types.ts";

const HOUR = 60 * 60;
const MIN = 60;

export const CROP_SECONDS: Record<CropName, number> = {
  Sunflower: 1 * MIN,
  Potato: 5 * MIN,
  Rhubarb: 10 * MIN,
  Pumpkin: 30 * MIN,
  Zucchini: 30 * MIN,
  Carrot: 1 * HOUR,
  Yam: 1 * HOUR,
  Cabbage: 2 * HOUR,
  Broccoli: 2 * HOUR,
  Soybean: 3 * HOUR,
  Beetroot: 4 * HOUR,
  Pepper: 4 * HOUR,
  Cauliflower: 8 * HOUR,
  Parsnip: 12 * HOUR,
  Eggplant: 16 * HOUR,
  Corn: 20 * HOUR,
  Onion: 20 * HOUR,
  Radish: 24 * HOUR,
  Wheat: 24 * HOUR,
  Turnip: 24 * HOUR,
  Kale: 36 * HOUR,
  Artichoke: 36 * HOUR,
  Barley: 48 * HOUR,
};

// Mirrors PATCH_FRUIT_SEEDS[seed].plantSeconds in
// sunflower-land/src/features/game/types/fruits.ts. plantSeconds applies
// per-cycle (initial grow uses plantedAt; subsequent cycles use
// harvestedAt) — see fruitPatchReadiness.ts.
export const PATCH_FRUIT_SECONDS: Record<PatchFruitName, number> = {
  Tomato: 2 * HOUR,
  Lemon: 4 * HOUR,
  Blueberry: 6 * HOUR,
  Celestine: 6 * HOUR,
  Orange: 8 * HOUR,
  Apple: 12 * HOUR,
  Banana: 12 * HOUR,
  Lunara: 12 * HOUR,
  Duskberry: 24 * HOUR,
};

// Mirrors GREENHOUSE_CROP_TIME_SECONDS in
// sunflower-land/src/features/game/events/landExpansion/harvestGreenHouse.ts.
// Greenhouse plants don't have multi-harvest cycles like fruit patches —
// they're one-shot like crops.
export const GREENHOUSE_SECONDS: Record<GreenhousePlantName, number> = {
  Grape: 12 * HOUR,
  Rice: 32 * HOUR,
  Olive: 44 * HOUR,
};
