import type { GameState } from "../types";
import {
  CROP_SECONDS,
  GREENHOUSE_CROP_SECONDS,
  GREENHOUSE_FRUIT_SECONDS,
  HONEY_FULL_SECONDS,
  PATCH_FRUIT_SECONDS,
} from "./durations";

export type TimerCategory =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Cooking"
  | "Composters"
  | "Animals"
  | "Beehives"
  | "Deliveries"
  | "Bounties";

export type Timer = {
  category: TimerCategory;
  label: string;
  sublabel?: string;
  /** Absolute target time in ms since epoch. */
  readyAt: number;
  /** True if the timer is "expires at" rather than "ready at". */
  isDeadline?: boolean;
  /** Source object id when available — useful for stable keys. */
  key: string;
};

export function extractTimers(state: GameState | undefined): Timer[] {
  if (!state) return [];
  const timers: Timer[] = [];

  // Crops
  for (const [id, plot] of Object.entries(state.crops ?? {})) {
    const crop = plot.crop;
    if (!crop) continue;
    const seconds = CROP_SECONDS[crop.name];
    if (!seconds) continue;
    timers.push({
      category: "Crops",
      label: crop.name,
      sublabel: `Plot ${id}`,
      readyAt: crop.plantedAt + seconds * 1000,
      key: `crop-${id}`,
    });
  }

  // Fruit patches
  for (const [id, patch] of Object.entries(state.fruitPatches ?? {})) {
    const fruit = patch.fruit;
    if (!fruit) continue;
    const seconds = PATCH_FRUIT_SECONDS[fruit.name];
    if (!seconds) continue;
    timers.push({
      category: "Fruit Patches",
      label: fruit.name,
      sublabel:
        fruit.harvestsLeft != null
          ? `Patch ${id} · ${fruit.harvestsLeft} left`
          : `Patch ${id}`,
      readyAt: fruit.plantedAt + seconds * 1000,
      key: `fruit-${id}`,
    });
  }

  // Greenhouse pots
  for (const [id, pot] of Object.entries(state.greenhouse?.pots ?? {})) {
    const plant = pot.plant;
    if (!plant) continue;
    const seconds =
      GREENHOUSE_CROP_SECONDS[plant.name] ??
      GREENHOUSE_FRUIT_SECONDS[plant.name];
    if (!seconds) continue;
    timers.push({
      category: "Greenhouse",
      label: plant.name,
      sublabel: `Pot ${id}`,
      readyAt: plant.plantedAt + seconds * 1000,
      key: `greenhouse-${id}`,
    });
  }

  // Cooking buildings
  const COOKING_BUILDINGS = new Set([
    "Fire Pit",
    "Kitchen",
    "Bakery",
    "Deli",
    "Smoothie Shack",
  ]);
  for (const [name, list] of Object.entries(state.buildings ?? {})) {
    if (!COOKING_BUILDINGS.has(name)) continue;
    list.forEach((b, idx) => {
      (b.crafting ?? []).forEach((recipe, qIdx) => {
        if (!recipe?.readyAt) return;
        timers.push({
          category: "Cooking",
          label: recipe.name,
          sublabel: `${name}${list.length > 1 ? ` #${idx + 1}` : ""}${
            (b.crafting?.length ?? 0) > 1 ? ` · queue ${qIdx + 1}` : ""
          }`,
          readyAt: recipe.readyAt,
          key: `cook-${name}-${idx}-${qIdx}`,
        });
      });
    });
  }

  // Composters
  const COMPOSTERS = new Set([
    "Compost Bin",
    "Turbo Composter",
    "Premium Composter",
  ]);
  for (const [name, list] of Object.entries(state.buildings ?? {})) {
    if (!COMPOSTERS.has(name)) continue;
    list.forEach((b, idx) => {
      const ready = b.producing?.readyAt;
      if (!ready || !b.producing?.name) return;
      timers.push({
        category: "Composters",
        label: b.producing.name,
        sublabel: `${name}${list.length > 1 ? ` #${idx + 1}` : ""}`,
        readyAt: ready,
        key: `compost-${name}-${idx}`,
      });
    });
  }

  // Animals (henHouse + barn)
  const animalBuildings: Array<["henHouse" | "barn", typeof state.henHouse]> = [
    ["henHouse", state.henHouse],
    ["barn", state.barn],
  ];
  for (const [building, b] of animalBuildings) {
    for (const [id, animal] of Object.entries(b?.animals ?? {})) {
      if (!animal.awakeAt) continue;
      timers.push({
        category: "Animals",
        label: animal.type,
        sublabel: `${building === "henHouse" ? "Hen House" : "Barn"} · ${animal.state}`,
        readyAt: animal.awakeAt,
        key: `animal-${id}`,
      });
    }
  }

  // Beehives — we approximate full-from-zero as 24h, scaled by current produced.
  for (const [id, hive] of Object.entries(state.beehives ?? {})) {
    const produced = hive.honey?.produced ?? 0;
    const updatedAt = hive.honey?.updatedAt;
    if (!updatedAt || produced >= 1) continue;
    const remainingSeconds = HONEY_FULL_SECONDS * (1 - produced);
    timers.push({
      category: "Beehives",
      label: "Honey",
      sublabel: `Hive ${id} · ${(produced * 100).toFixed(0)}% full`,
      readyAt: updatedAt + remainingSeconds * 1000,
      key: `hive-${id}`,
    });
  }

  // Deliveries with explicit readyAt
  for (const order of state.delivery?.orders ?? []) {
    if (order.readyAt) {
      timers.push({
        category: "Deliveries",
        label: `${order.from ?? "Delivery"}`,
        sublabel: `Unlocks at`,
        readyAt: order.readyAt,
        key: `delivery-ready-${order.id}`,
      });
    }
    if (order.expiresAt) {
      timers.push({
        category: "Deliveries",
        label: `${order.from ?? "Delivery"} expires`,
        sublabel: `Complete before`,
        readyAt: order.expiresAt,
        isDeadline: true,
        key: `delivery-exp-${order.id}`,
      });
    }
  }

  // Bounties — board requests with expiresAt
  for (const req of state.bounties?.requests ?? []) {
    if (!req.expiresAt) continue;
    timers.push({
      category: "Bounties",
      label: req.name ?? "Bounty",
      sublabel: `Expires`,
      readyAt: req.expiresAt,
      isDeadline: true,
      key: `bounty-${req.id}`,
    });
  }

  timers.sort((a, b) => a.readyAt - b.readyAt);
  return timers;
}

export function groupByCategory(timers: Timer[]): Record<string, Timer[]> {
  const out: Record<string, Timer[]> = {};
  for (const t of timers) {
    (out[t.category] ??= []).push(t);
  }
  return out;
}
