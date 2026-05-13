import {
  getBoostIcon,
  getCookingAmount,
  getItemIcon,
  getProcessedResourceAmount,
  type BuildingName,
  type BuildingProduct,
  type GameState,
  type PlacedItem,
  type ProcessedResource,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext, TimerSlot } from "./types.ts";

// One Timer per cooking / processing building INSTANCE. The card's
// `slots` field carries each queue position (item + predicted yield +
// readyAt), and `readyAt` at the card level is the earliest slot — so
// the section header shows the next thing this building will produce.
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
// Aura. We thread them straight onto each slot so the card can
// render a per-slot boost dropdown.

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
    const instances = (state.buildings?.[name] ?? []) as PlacedItem[];
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

  const fishMarkets = (state.buildings?.[PROCESSING_BUILDING] ??
    []) as PlacedItem[];
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
  raw: ReadonlyArray<{ name: string; value: string }>,
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

    if (slot.kind === "cooking") {
      const base =
        cookCounter[recipeName] ??
        (farmActivity as Record<string, number | undefined>)[
          `${recipeName} Cooked`
        ] ??
        0;
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
    } else {
      const base =
        processedCounter[recipeName] ??
        (farmActivity as Record<string, number | undefined>)[
          `${recipeName} Processed`
        ] ??
        0;
      try {
        const result = getProcessedResourceAmount({
          game: state,
          resource: recipeName as ProcessedResource,
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

  // Group raw slots back by (building, instanceKey) preserving original
  // queue order (slotIdx), and emit one Timer per building instance.
  type Group = {
    building: BuildingName;
    instanceKey: string;
    slots: RawSlot[];
  };
  const groups = new Map<string, Group>();
  for (const slot of rawSlots) {
    const key = `${slot.building}|${slot.instanceKey}`;
    const g = groups.get(key) ?? {
      building: slot.building,
      instanceKey: slot.instanceKey,
      slots: [],
    };
    g.slots.push(slot);
    groups.set(key, g);
  }

  const out: Timer[] = [];

  for (const { building, instanceKey, slots: rawList } of groups.values()) {
    rawList.sort((a, b) => a.slotIdx - b.slotIdx);

    const slotEntries: TimerSlot[] = [];
    let earliestReady = Number.POSITIVE_INFINITY;

    for (const slot of rawList) {
      const p = predicted.get(slotKey(slot));
      const amount = p?.amount ?? 1;
      slotEntries.push({
        item: slot.recipe.name,
        icon: getItemIcon(slot.recipe.name),
        amount,
        readyAt: slot.recipe.readyAt,
        boosts: p?.boosts,
      });
      earliestReady = Math.min(earliestReady, slot.recipe.readyAt);
    }

    out.push({
      id: `cooking:${building}:${instanceKey}`,
      category: "Cooking",
      label: building,
      icon: getItemIcon(building),
      readyAt: earliestReady,
      slots: slotEntries,
      // Boosts now live per slot; the card-level dropdown stays off
      // when we're rendering slot rows.
      // Each building instance is its own card — no merging.
      aggregationKey: `Cooking|${building}|${instanceKey}`,
    });
  }

  // Placed-but-empty buildings — one card per instance, no slots, marked
  // idle so TimerCard hides the countdown and TimerSection sorts them
  // below the active ones.
  for (const { building, instanceKey } of idleBuildings) {
    out.push({
      id: `cooking:${building}:${instanceKey}`,
      category: "Cooking",
      label: building,
      icon: getItemIcon(building),
      readyAt: 0,
      idle: true,
      idleText: "Not cooking",
      aggregationKey: `Cooking|${building}|${instanceKey}`,
    });
  }

  return out;
}
