import type { GameState, Rock } from "../types";
import {
  CRIMSTONE_RECOVERY_SECONDS,
  CROP_SECONDS,
  FLOWER_SECONDS,
  GOLD_RECOVERY_SECONDS,
  GREENHOUSE_CROP_SECONDS,
  GREENHOUSE_FRUIT_SECONDS,
  HONEY_FULL_SECONDS,
  IRON_RECOVERY_SECONDS,
  MUSHROOM_SPAWN_SECONDS,
  OIL_RESERVE_RECOVERY_SECONDS,
  PATCH_FRUIT_SECONDS,
  STONE_RECOVERY_SECONDS,
  SUNSTONE_RECOVERY_SECONDS,
  TREE_RECOVERY_SECONDS,
  getMaxSaltCharges,
} from "./durations";

export type TimerCategory =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Cooking"
  | "Composters"
  | "Animals"
  | "Flowers"
  | "Beehives"
  | "Resources"
  | "Mushrooms"
  | "Aging Shed"
  | "Crafting"
  | "Lava Pits"
  | "Crab Traps"
  | "Daily Rewards"
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
      // Sublabel is just the building name (with #N when there's more than
      // one of that type). The queue index used to be here but it gets
      // collapsed by aggregation anyway — what the player wants to know is
      // *which building* is cooking the recipe, not which queue slot.
      const buildingLabel = list.length > 1 ? `${name} #${idx + 1}` : name;
      (b.crafting ?? []).forEach((recipe, qIdx) => {
        if (!recipe?.readyAt) return;
        timers.push({
          category: "Cooking",
          label: recipe.name,
          sublabel: buildingLabel,
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

  // Flowers — flower bed stores the produced flower name; the duration is
  // derived from the flower's seed family (FLOWER_SECONDS table).
  for (const [id, bed] of Object.entries(state.flowers?.flowerBeds ?? {})) {
    const flower = bed.flower;
    if (!flower) continue;
    const seconds = FLOWER_SECONDS[flower.name];
    if (!seconds) continue;
    timers.push({
      category: "Flowers",
      label: flower.name,
      readyAt: flower.plantedAt + seconds * 1000,
      key: `flower-${id}`,
    });
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

  // Resources (trees + rock-shaped resources). We skip entries where the
  // resource has never been touched (minedAt/choppedAt === 0) — they're
  // always available, so showing them as "Ready" is just noise.
  for (const [id, tree] of Object.entries(state.trees ?? {})) {
    const choppedAt = tree.wood?.choppedAt;
    if (!choppedAt) continue;
    timers.push({
      category: "Resources",
      label: "Tree",
      readyAt: choppedAt + TREE_RECOVERY_SECONDS * 1000,
      key: `tree-${id}`,
    });
  }

  const ROCK_RESOURCES: Array<{
    field: keyof Pick<
      GameState,
      "stones" | "iron" | "gold" | "crimstones" | "sunstones"
    >;
    label: string;
    seconds: number;
  }> = [
    { field: "stones", label: "Stone", seconds: STONE_RECOVERY_SECONDS },
    { field: "iron", label: "Iron", seconds: IRON_RECOVERY_SECONDS },
    { field: "gold", label: "Gold", seconds: GOLD_RECOVERY_SECONDS },
    {
      field: "crimstones",
      label: "Crimstone",
      seconds: CRIMSTONE_RECOVERY_SECONDS,
    },
    {
      field: "sunstones",
      label: "Sunstone",
      seconds: SUNSTONE_RECOVERY_SECONDS,
    },
  ];
  for (const { field, label, seconds } of ROCK_RESOURCES) {
    const rocks = (state[field] ?? {}) as Record<string, Rock>;
    for (const [id, rock] of Object.entries(rocks)) {
      const minedAt = rock.stone?.minedAt;
      if (!minedAt) continue;
      timers.push({
        category: "Resources",
        label,
        readyAt: minedAt + seconds * 1000,
        key: `${field}-${id}`,
      });
    }
  }

  for (const [id, reserve] of Object.entries(state.oilReserves ?? {})) {
    const drilledAt = reserve.oil?.drilledAt;
    if (!drilledAt) continue;
    timers.push({
      category: "Resources",
      label: "Oil Reserve",
      readyAt: drilledAt + OIL_RESERVE_RECOVERY_SECONDS * 1000,
      key: `oil-${id}`,
    });
  }

  // Salt nodes accrue charges over time rather than being a one-shot
  // recovery, so the timer here is "next charge in X". Once a node hits
  // max charges, the stored nextChargeAt keeps drifting in the gameState
  // but the wait is meaningless — we skip those.
  const sculptureLevel = state.sculptures?.["Salt Sculpture"]?.level ?? 0;
  const maxSaltCharges = getMaxSaltCharges(sculptureLevel);
  for (const [id, node] of Object.entries(state.saltFarm?.nodes ?? {})) {
    const stored = node.salt?.storedCharges ?? 0;
    const nextChargeAt = node.salt?.nextChargeAt;
    if (!nextChargeAt || stored >= maxSaltCharges) continue;
    timers.push({
      category: "Resources",
      label: "Salt",
      readyAt: nextChargeAt,
      key: `salt-${id}`,
    });
  }

  // Mushrooms — both kinds spawn on a 16h cycle.
  if (state.mushrooms?.spawnedAt) {
    timers.push({
      category: "Mushrooms",
      label: "Wild Mushroom",
      readyAt: state.mushrooms.spawnedAt + MUSHROOM_SPAWN_SECONDS * 1000,
      key: "mushroom-wild",
    });
  }
  if (state.mushrooms?.magicSpawnedAt) {
    timers.push({
      category: "Mushrooms",
      label: "Magic Mushroom",
      readyAt: state.mushrooms.magicSpawnedAt + MUSHROOM_SPAWN_SECONDS * 1000,
      key: "mushroom-magic",
    });
  }

  // Aging Shed — fermentation, aging rack (cheese / fish), spice rack.
  // Each rack entry already carries its own readyAt.
  const racks = state.agingShed?.racks;
  for (const job of racks?.fermentation ?? []) {
    if (!job.readyAt) continue;
    timers.push({
      category: "Aging Shed",
      label: job.recipe ?? "Fermentation",
      readyAt: job.readyAt,
      key: `ferment-${job.id}`,
    });
  }
  for (const job of racks?.aging ?? []) {
    if (!job.readyAt) continue;
    timers.push({
      category: "Aging Shed",
      label: job.recipe ?? job.fish ?? "Aging",
      readyAt: job.readyAt,
      key: `aging-${job.id}`,
    });
  }
  for (const job of racks?.spice ?? []) {
    if (!job.readyAt) continue;
    timers.push({
      category: "Aging Shed",
      label: job.recipe ?? "Spice",
      readyAt: job.readyAt,
      key: `spice-${job.id}`,
    });
  }

  // Crafting Box — read queue[0] when present, fall back to deprecated
  // top-level readyAt for older save shapes.
  const cbQueue = state.craftingBox?.queue ?? [];
  cbQueue.forEach((item, idx) => {
    if (!item?.readyAt) return;
    const collectibleName =
      typeof item.collectible === "object"
        ? (item.collectible?.collectible ?? item.collectible?.wearable)
        : item.collectible;
    timers.push({
      category: "Crafting",
      label: collectibleName ?? item.wearable ?? "Crafting",
      readyAt: item.readyAt,
      key: `craft-${idx}`,
    });
  });
  if (cbQueue.length === 0 && state.craftingBox?.readyAt) {
    timers.push({
      category: "Crafting",
      label: "Crafting",
      readyAt: state.craftingBox.readyAt,
      key: "craft-legacy",
    });
  }

  // Lava pits — only show when actively running (startedAt set, not yet
  // collected). Idle/uninitialised pits don't have a meaningful timer.
  for (const [id, pit] of Object.entries(state.lavaPits ?? {})) {
    if (!pit.startedAt || !pit.readyAt) continue;
    if (pit.collectedAt && pit.collectedAt >= pit.startedAt) continue;
    timers.push({
      category: "Lava Pits",
      label: "Lava Pit",
      readyAt: pit.readyAt,
      key: `lava-${id}`,
    });
  }

  // Crab traps (water traps placed on beach plots). The crustacean a trap
  // will yield is locked in at placement, stored on `waterTrap.caught` —
  // surface that as the label so the player sees the output, not the pot.
  for (const [id, spot] of Object.entries(state.crabTraps?.trapSpots ?? {})) {
    const trap = spot.waterTrap;
    if (!trap?.readyAt) continue;
    const caughtName = Object.keys(trap.caught ?? {})[0];
    timers.push({
      category: "Crab Traps",
      label: caughtName ?? trap.type,
      readyAt: trap.readyAt,
      key: `trap-${id}`,
    });
  }

  // Daily rewards chest — resets at 00:00 UTC each day, not 24h after the
  // last collection. We compute the start of the UTC day *after* the one
  // the chest was last collected on.
  const collectedAt = state.dailyRewards?.chest?.collectedAt;
  if (collectedAt) {
    const collected = new Date(collectedAt);
    const nextResetAt = Date.UTC(
      collected.getUTCFullYear(),
      collected.getUTCMonth(),
      collected.getUTCDate() + 1,
    );
    timers.push({
      category: "Daily Rewards",
      label: "Daily Chest",
      readyAt: nextResetAt,
      key: "daily-chest",
    });
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

export type AggregatedTimer = {
  category: TimerCategory;
  label: string;
  count: number;
  /** When the next item in the group is ready. */
  earliestReadyAt: number;
  /** When the last item in the group is ready (== earliest when count == 1). */
  latestReadyAt: number;
  /** Unique non-empty sublabels from the underlying timers — used by Cooking
   * to surface which building(s) the recipe is queued in. */
  sublabels: string[];
  isDeadline?: boolean;
  key: string;
};

/**
 * Roll up timers that share the same (category, label) — e.g. all Sunflowers,
 * or all Chickens — into a single entry with count + min/max ready times.
 * Different labels stay separate, so a board of mixed bounties or a kitchen
 * cooking three different recipes still shows one row per recipe.
 */
export function aggregateTimers(timers: Timer[]): AggregatedTimer[] {
  const groups = new Map<string, AggregatedTimer>();
  for (const t of timers) {
    // "Output: Input" labels aggregate by their output — e.g. every
    // "Greenhouse Goodie: Pickled X" variant merges into a single row,
    // the same way 12 sunflowers collapse into one. The input slides
    // into the sublabel slot for any UI that wants to surface it.
    const colonIdx = t.label.indexOf(": ");
    const label = colonIdx > 0 ? t.label.slice(0, colonIdx) : t.label;
    const inputSublabel =
      colonIdx > 0 ? t.label.slice(colonIdx + 2) : undefined;
    const sublabel = t.sublabel ?? inputSublabel;

    const key = `${t.category}|${label}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        category: t.category,
        label,
        count: 1,
        earliestReadyAt: t.readyAt,
        latestReadyAt: t.readyAt,
        sublabels: sublabel ? [sublabel] : [],
        isDeadline: t.isDeadline,
        key,
      });
    } else {
      existing.count++;
      existing.earliestReadyAt = Math.min(existing.earliestReadyAt, t.readyAt);
      existing.latestReadyAt = Math.max(existing.latestReadyAt, t.readyAt);
      if (sublabel && !existing.sublabels.includes(sublabel)) {
        existing.sublabels.push(sublabel);
      }
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.earliestReadyAt - b.earliestReadyAt,
  );
}

/**
 * Display order for timer sections. Returned object iteration follows
 * insertion order (ES2015+), so listing categories here is what controls
 * the order they appear in the dashboard and sidebar. Any category that
 * shows up at runtime but isn't in this list falls to the end.
 */
const CATEGORY_ORDER: TimerCategory[] = [
  "Daily Rewards",
  "Crops",
  "Fruit Patches",
  "Resources",
  "Cooking",
  "Animals",
  "Flowers",
  "Beehives",
  "Greenhouse",
  "Mushrooms",
  "Crab Traps",
  "Aging Shed",
  "Composters",
  "Bounties",
];

export function groupByCategory(
  timers: AggregatedTimer[],
): Record<string, AggregatedTimer[]> {
  const buckets = new Map<TimerCategory, AggregatedTimer[]>();
  for (const t of timers) {
    const list = buckets.get(t.category);
    if (list) list.push(t);
    else buckets.set(t.category, [t]);
  }

  const out: Record<string, AggregatedTimer[]> = {};
  for (const cat of CATEGORY_ORDER) {
    const list = buckets.get(cat);
    if (list) out[cat] = list;
  }
  // Anything not in CATEGORY_ORDER (e.g. a new category added before this
  // list is updated) falls through to the end so it still renders.
  for (const [cat, list] of buckets) {
    if (!(cat in out)) out[cat] = list;
  }
  return out;
}
