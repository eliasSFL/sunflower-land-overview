import {
  COOKABLES,
  getBoostIcon,
  getCookingAmount,
  getItemIcon,
  getProcessedResourceAmount,
  PROCESSED_RESOURCES,
  type BoostName,
  type BuildingName,
  type BuildingProduct,
  type CookableName,
  type FarmActivityName,
  type GameState,
  type PlacedItem,
  type ProcessedResource,
} from "../game/index.ts";
import type { Boost, Category, Timer, TimerContext } from "./types.ts";
import { COOKING_BUILDING_CATEGORIES } from "./types.ts";

// `BuildingProduct.name` is `CookableName | ProcessedResource`; these
// guards narrow it without a cast, using the upstream lookup tables
// that already enumerate each side of the union.
const isCookable = (
  name: CookableName | ProcessedResource,
): name is CookableName => name in COOKABLES;
const isProcessedResource = (
  name: CookableName | ProcessedResource,
): name is ProcessedResource => name in PROCESSED_RESOURCES;

// Cooking-building names overlap with the Category union (Fire Pit,
// Bakery, … as well as Fish Market). The card-emitting loop pushes
// `slot.building` into `category`; this guard proves the subset.
const isCookingTimerCategory = (
  name: BuildingName,
): name is BuildingName & Category =>
  (COOKING_BUILDING_CATEGORIES as readonly string[]).includes(name);

// One Timer per queue slot — mirrors the Crafting Box pattern so each
// recipe gets its own row inside the building's panel (the panel itself
// comes from `category: <building name>`). Slot index lives in the
// aggregationKey so identical recipes at different positions stay
// separate cards.
//
// Predictive PRNG: `getCookingAmount` / `getProcessedResourceAmount`
// thread `farmId + counter + KNOWN_IDS[recipe]` through `prngChance`,
// matching what the game does on claim. Slots across ALL cooking
// buildings are sorted by readyAt before yield prediction so the
// per-recipe counter advances in claim order. A Kitchen and a Fire Pit
// both queueing the same recipe will see correctly-shifted PRNG rolls.
//
// Boost surfacing: both upstream helpers now return a `boostsUsed`
// array — `getCookingAmount` lists Double Nom / Fiery Jackpot /
// Master Chef's Cleaver, `getProcessedResourceAmount` lists Bubble
// Aura. We surface them as card-level boosts (chevron dropdown) on
// each slot's row, since each slot is now a standalone card.
//
// Idle buildings (placed but no queue) emit one idle Timer per
// instance with `idle: true` so the section header still renders the
// panel with a "Not cooking" body — same approach as Crafting Box.

const COOKING_BUILDINGS: readonly BuildingName[] = [
  "Fire Pit",
  "Bakery",
  "Deli",
  "Smoothie Shack",
  "Kitchen",
];

const PROCESSING_BUILDING: BuildingName = "Fish Market";

type RawSlot = {
  building: BuildingName;
  instanceKey: string;
  slotIdx: number;
  recipe: BuildingProduct;
  kind: "cooking" | "processing";
};

type Predicted = {
  amount: number;
  boosts?: Boost[];
};

type IdleBuilding = {
  building: BuildingName;
  instanceKey: string;
};

function collectRawSlots(state: GameState): {
  slots: RawSlot[];
  idle: IdleBuilding[];
} {
  const slots: RawSlot[] = [];
  const idle: IdleBuilding[] = [];

  const pushIdle = (
    building: BuildingName,
    inst: PlacedItem,
    idx: number,
  ): void => {
    // `coordinates` undefined would mean the building exists in the
    // buildings array but isn't placed on the land (e.g. mid-move).
    // Skip those so the card list doesn't show off-board buildings.
    if (!inst.coordinates) return;
    idle.push({ building, instanceKey: inst.id ?? `${idx}` });
  };

  for (const name of COOKING_BUILDINGS) {
    const instances = state.buildings?.[name] ?? [];
    instances.forEach((inst, idx) => {
      const queue = inst.crafting ?? [];
      const instanceKey = inst.id ?? `${idx}`;
      if (queue.length === 0) {
        pushIdle(name, inst, idx);
        return;
      }
      queue.forEach((recipe, slotIdx) => {
        slots.push({
          building: name,
          instanceKey,
          slotIdx,
          recipe,
          kind: "cooking",
        });
      });
    });
  }

  const fishMarkets = state.buildings?.[PROCESSING_BUILDING] ?? [];
  fishMarkets.forEach((inst, idx) => {
    const queue = inst.processing ?? [];
    const instanceKey = inst.id ?? `${idx}`;
    if (queue.length === 0) {
      pushIdle(PROCESSING_BUILDING, inst, idx);
      return;
    }
    queue.forEach((recipe, slotIdx) => {
      slots.push({
        building: PROCESSING_BUILDING,
        instanceKey,
        slotIdx,
        recipe,
        kind: "processing",
      });
    });
  });

  return { slots, idle };
}

function toBoosts(
  raw: ReadonlyArray<{ name: BoostName; value: string }>,
  state: GameState,
): Boost[] | undefined {
  if (raw.length === 0) return undefined;
  return raw.map(({ name, value }) => ({
    name,
    value,
    icon: getBoostIcon(name, state),
  }));
}

export function extractCookingTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const { slots: rawSlots, idle: idleBuildings } = collectRawSlots(state);
  if (rawSlots.length === 0 && idleBuildings.length === 0) return [];

  // Sort by readyAt so per-recipe PRNG counters advance in claim order
  // before we group by building. Within a single building's queue this
  // is also the natural display order.
  const sorted = [...rawSlots].sort(
    (a, b) => a.recipe.readyAt - b.recipe.readyAt,
  );

  const farmActivity = state.farmActivity ?? {};
  const cookCounter: Record<string, number> = {};
  const processedCounter: Record<string, number> = {};

  // Map slot identity → predicted yield/boosts so we can re-emit them
  // when iterating per-building below.
  const predicted = new Map<string, Predicted>();
  const slotKey = (s: RawSlot) => `${s.building}|${s.instanceKey}|${s.slotIdx}`;

  for (const slot of sorted) {
    const recipeName = slot.recipe.name;
    let amount = 1;
    let boosts: Boost[] | undefined;

    if (slot.kind === "cooking" && isCookable(recipeName)) {
      const activityKey = `${recipeName} Cooked` satisfies FarmActivityName;
      const base = cookCounter[recipeName] ?? farmActivity[activityKey] ?? 0;
      try {
        const result = getCookingAmount({
          building: slot.building,
          recipe: slot.recipe,
          farmId: ctx.farmId,
          counter: base,
          game: state,
        });
        amount = result.amount;
        boosts = toBoosts(result.boostsUsed, state);
      } catch {
        // Fall back to the initial amount=1 set above.
      }
      cookCounter[recipeName] = base + 1;
    } else if (slot.kind === "processing" && isProcessedResource(recipeName)) {
      const activityKey = `${recipeName} Processed` satisfies FarmActivityName;
      const base =
        processedCounter[recipeName] ?? farmActivity[activityKey] ?? 0;
      try {
        const result = getProcessedResourceAmount({
          game: state,
          resource: recipeName,
          farmId: ctx.farmId,
          counter: base,
        });
        amount = result.amount.toNumber();
        boosts = toBoosts(result.boostsUsed, state);
      } catch {
        // Fall back to the initial amount=1 set above.
      }
      processedCounter[recipeName] = base + 1;
    }

    predicted.set(slotKey(slot), { amount, boosts });
  }

  const out: Timer[] = [];

  // One Timer per queue slot — same shape as Crop Machine packs /
  // Crafting Box queue items. Recipe name becomes the card headline,
  // recipe icon the card icon, and the unique aggregationKey keeps
  // identical recipes in different queue positions as separate cards.
  for (const slot of rawSlots) {
    if (!isCookingTimerCategory(slot.building)) continue;
    const p = predicted.get(slotKey(slot));
    const amount = p?.amount ?? 1;
    out.push({
      id: `cooking:${slot.building}:${slot.instanceKey}:slot:${slot.slotIdx}`,
      category: slot.building,
      label: slot.recipe.name,
      icon: getItemIcon(slot.recipe.name),
      readyAt: slot.recipe.readyAt,
      predictedYield: { amount, item: slot.recipe.name },
      boosts: p?.boosts,
      aggregationKey: `Cooking|${slot.building}|${slot.instanceKey}|${slot.slotIdx}`,
    });
  }

  // Placed-but-empty buildings — one idle Timer per instance so the
  // section panel still renders with a "Not cooking" body. Matches the
  // Crafting Box pattern.
  for (const { building, instanceKey } of idleBuildings) {
    if (!isCookingTimerCategory(building)) continue;
    out.push({
      id: `cooking:${building}:${instanceKey}:idle`,
      category: building,
      label: building,
      icon: getItemIcon(building),
      readyAt: 0,
      idle: true,
      idleText: "Not cooking",
      aggregationKey: `Cooking|${building}|${instanceKey}|idle`,
    });
  }

  return out;
}
