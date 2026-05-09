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
  | "Crop Machine"
  | "Lava Pits"
  | "Crab Traps"
  | "Salt Nodes"
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
  /** When set, the UI replaces the formatted countdown with this string —
   * used for static states like a salt node that's already at max charges. */
  displayOverride?: string;
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

  // Salt nodes accrue charges over time. Each node gets its own row with
  // current/max charge count; the right-side timer shows time-to-next-
  // charge for partial nodes and "Charges Full" for saturated ones.
  const sculptureLevel = state.sculptures?.["Salt Sculpture"]?.level ?? 0;
  const maxSaltCharges = getMaxSaltCharges(sculptureLevel);
  const saltNodeIds = Object.keys(state.saltFarm?.nodes ?? {}).sort(
    // Numeric sort so "10" doesn't come before "2".
    (a, b) => Number(a) - Number(b),
  );
  saltNodeIds.forEach((id, idx) => {
    const node = state.saltFarm?.nodes?.[id];
    if (!node) return;
    const stored = node.salt?.storedCharges ?? 0;
    const nextChargeAt = node.salt?.nextChargeAt;
    const isFull = stored >= maxSaltCharges;
    timers.push({
      category: "Salt Nodes",
      label: `Salt Node ${idx + 1}`,
      sublabel: `${stored}/${maxSaltCharges} charges`,
      // When full, anchor readyAt at "now" so the status dot computes as
      // "ready" (green) and these rows sort before partial nodes.
      readyAt: isFull ? Date.now() : (nextChargeAt ?? Date.now()),
      displayOverride: isFull ? "Charges Full" : undefined,
      key: `salt-${id}`,
    });
  });

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

  // Crop Machine — each placed machine has a queue of growth packs. A pack
  // only has a firm ETA once oil has been allocated to cover the remaining
  // grow time (readyAt). When the machine runs out of oil mid-pack, the
  // pack pauses at growsUntil; we surface that as a deadline (the moment
  // growth stops) so the player knows when to top up oil.
  (state.buildings?.["Crop Machine"] ?? []).forEach((machine, mIdx) => {
    const machineId = machine.id ?? `idx${mIdx}`;
    (machine.queue ?? []).forEach((pack, qIdx) => {
      if (pack.readyAt) {
        timers.push({
          category: "Crop Machine",
          label: pack.crop,
          sublabel: pack.seeds ? `${pack.seeds} seeds` : undefined,
          readyAt: pack.readyAt,
          key: `cropmachine-${machineId}-${qIdx}`,
        });
      } else if (pack.growsUntil) {
        timers.push({
          category: "Crop Machine",
          label: pack.crop,
          sublabel: pack.seeds ? `${pack.seeds} seeds · oil out` : "oil out",
          readyAt: pack.growsUntil,
          isDeadline: true,
          key: `cropmachine-${machineId}-${qIdx}`,
        });
      }
    });
  });

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
  /** Static text that overrides the countdown display (e.g. "Charges Full"). */
  displayOverride?: string;
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
        displayOverride: t.displayOverride,
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
  "Salt Nodes",
  "Lava Pits",
  "Cooking",
  "Animals",
  "Flowers",
  "Beehives",
  "Greenhouse",
  "Crop Machine",
  "Mushrooms",
  "Crab Traps",
  "Aging Shed",
  "Composters",
  "Crafting",
  "Bounties",
];

/**
 * Categories the player has infrastructure for, even if no timers are running
 * right now. Used so that e.g. an empty Crops section still renders ("No
 * crops planted") instead of disappearing entirely when every plot is bare.
 *
 * The rule throughout: a category is "active" when the corresponding subtree
 * of state exists with at least one entry. Categories tied to game-wide
 * features (Daily Rewards, Bounties, Mushrooms, Aging Shed, Crafting) are
 * keyed off the presence of their root object instead.
 */
export function extractActiveCategories(
  state: GameState | undefined,
): Set<TimerCategory> {
  const active = new Set<TimerCategory>();
  if (!state) return active;

  if (Object.keys(state.crops ?? {}).length > 0) active.add("Crops");
  if (Object.keys(state.fruitPatches ?? {}).length > 0)
    active.add("Fruit Patches");
  if (Object.keys(state.greenhouse?.pots ?? {}).length > 0)
    active.add("Greenhouse");
  if (Object.keys(state.flowers?.flowerBeds ?? {}).length > 0)
    active.add("Flowers");
  if (Object.keys(state.beehives ?? {}).length > 0) active.add("Beehives");

  const COOKING_BUILDINGS = [
    "Fire Pit",
    "Kitchen",
    "Bakery",
    "Deli",
    "Smoothie Shack",
  ];
  if (COOKING_BUILDINGS.some((n) => (state.buildings?.[n]?.length ?? 0) > 0))
    active.add("Cooking");

  const COMPOSTERS = ["Compost Bin", "Turbo Composter", "Premium Composter"];
  if (COMPOSTERS.some((n) => (state.buildings?.[n]?.length ?? 0) > 0))
    active.add("Composters");

  if ((state.buildings?.["Crop Machine"]?.length ?? 0) > 0)
    active.add("Crop Machine");

  if (
    Object.keys(state.henHouse?.animals ?? {}).length > 0 ||
    Object.keys(state.barn?.animals ?? {}).length > 0
  )
    active.add("Animals");

  if (
    Object.keys(state.trees ?? {}).length > 0 ||
    Object.keys(state.stones ?? {}).length > 0 ||
    Object.keys(state.iron ?? {}).length > 0 ||
    Object.keys(state.gold ?? {}).length > 0 ||
    Object.keys(state.crimstones ?? {}).length > 0 ||
    Object.keys(state.sunstones ?? {}).length > 0 ||
    Object.keys(state.oilReserves ?? {}).length > 0
  )
    active.add("Resources");

  if (Object.keys(state.saltFarm?.nodes ?? {}).length > 0)
    active.add("Salt Nodes");
  if (Object.keys(state.crabTraps?.trapSpots ?? {}).length > 0)
    active.add("Crab Traps");
  if (Object.keys(state.lavaPits ?? {}).length > 0) active.add("Lava Pits");

  if (state.mushrooms) active.add("Mushrooms");
  if (state.agingShed) active.add("Aging Shed");
  if (state.craftingBox) active.add("Crafting");
  if (state.dailyRewards) active.add("Daily Rewards");
  if (state.bounties) active.add("Bounties");

  return active;
}

export function groupByCategory(
  timers: AggregatedTimer[],
  activeCategories: ReadonlySet<TimerCategory> = new Set(),
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
    else if (activeCategories.has(cat)) out[cat] = [];
  }
  // Anything not in CATEGORY_ORDER (e.g. a new category added before this
  // list is updated) falls through to the end so it still renders.
  for (const [cat, list] of buckets) {
    if (!(cat in out)) out[cat] = list;
  }
  // Mirror that fall-through for active-but-idle categories not in the order
  // list — without this, a category that exists in the type but isn't ordered
  // (e.g. Crafting, Lava Pits) would be dropped when its timers are empty.
  for (const cat of activeCategories) {
    if (!(cat in out)) out[cat] = [];
  }
  return out;
}
