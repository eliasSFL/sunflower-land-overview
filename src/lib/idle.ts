import {
  MAX_COOKING_SLOTS,
  MAX_FISH_PROCESSING_SLOTS,
  MAX_CROP_MACHINE_QUEUE_SIZE,
  hasVipAccess,
  getBoostedAnimalCapacity,
  getMaxFermentationSlots,
  getMaxSpiceRackSlots,
  getAgingSlotCount,
  type BuildingName,
  type GameState,
} from "../game/index.ts";
import type { AggregatedTimer, Category } from "../timers/index.ts";

// Hardcoded upstream: startCrafting.ts uses `hasVipAccess ? 4 : 1`.
// Not exported as a constant, so we mirror the literals here.
const MAX_CRAFTING_BOX_SLOTS_VIP = 4;
const MAX_CRAFTING_BOX_SLOTS_FREE = 1;

// Each cooking building category name is also its BuildingName upstream
// — the intersection keeps `state.buildings[name]` lookups well-typed.
const COOKING_BUILDINGS: readonly (Category & BuildingName)[] = [
  "Fire Pit",
  "Bakery",
  "Deli",
  "Smoothie Shack",
  "Kitchen",
];

export type IdleEntry = {
  category: Category;
  message: string;
};

function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

function cookingBuildingFree(
  state: GameState,
  building: BuildingName,
  now: number,
): number {
  const instances = state.buildings?.[building] ?? [];
  if (instances.length === 0) return 0;
  const maxPerBuilding = hasVipAccess({ game: state, now })
    ? MAX_COOKING_SLOTS
    : 1;
  let free = 0;
  for (const inst of instances) {
    if (!inst.coordinates) continue;
    const used = inst.crafting?.length ?? 0;
    free += Math.max(0, maxPerBuilding - used);
  }
  return free;
}

function fishMarketFree(state: GameState, now: number): number {
  const instances = state.buildings?.["Fish Market"] ?? [];
  if (instances.length === 0) return 0;
  const maxPerBuilding = hasVipAccess({ game: state, now })
    ? MAX_FISH_PROCESSING_SLOTS
    : 1;
  let free = 0;
  for (const inst of instances) {
    if (!inst.coordinates) continue;
    const used = inst.processing?.length ?? 0;
    free += Math.max(0, maxPerBuilding - used);
  }
  return free;
}

function cropMachineFree(state: GameState): number {
  const machines = state.buildings?.["Crop Machine"] ?? [];
  if (machines.length === 0) return 0;
  const maxQueue = MAX_CROP_MACHINE_QUEUE_SIZE(state);
  let free = 0;
  for (const m of machines) {
    const used = m.queue?.length ?? 0;
    free += Math.max(0, maxQueue - used);
  }
  return free;
}

function craftingBoxFree(state: GameState, now: number): number {
  // The box is a single-instance building, but its queue lives on
  // top-level `state.craftingBox.queue` rather than on the placed
  // building (unlike cooking buildings). See startCrafting.ts which
  // reads `copy.craftingBox.queue` to gate `availableSlots`.
  const instances = state.buildings?.["Crafting Box"] ?? [];
  if (!instances.some((b) => !!b.coordinates)) return 0;
  const maxSlots = hasVipAccess({ game: state, now })
    ? MAX_CRAFTING_BOX_SLOTS_VIP
    : MAX_CRAFTING_BOX_SLOTS_FREE;
  const used = state.craftingBox?.queue?.length ?? 0;
  return Math.max(0, maxSlots - used);
}

type AgingRack = { category: Category; free: number };

function agingShedRacks(state: GameState): AgingRack[] {
  // Mirror the placement check in agingShed.ts: a shed listed under
  // `buildings["Aging Shed"]` without `coordinates` is mid-move / not
  // on the land and shouldn't count as engaged.
  const placedItems = state.buildings?.["Aging Shed"] ?? [];
  if (!placedItems.some((b) => !!b.coordinates)) return [];
  const shed = state.agingShed;
  if (!shed) return [];
  const level = shed.level ?? 0;
  return [
    {
      category: "Aging Rack",
      free: Math.max(
        0,
        getAgingSlotCount(level) - (shed.racks?.aging?.length ?? 0),
      ),
    },
    {
      category: "Fermentation Rack",
      free: Math.max(
        0,
        getMaxFermentationSlots(level) -
          (shed.racks?.fermentation?.length ?? 0),
      ),
    },
    {
      category: "Spice Rack",
      free: Math.max(
        0,
        getMaxSpiceRackSlots(level) - (shed.racks?.spice?.length ?? 0),
      ),
    },
  ];
}

function animalBuildingFree(
  state: GameState,
  buildingKey: "henHouse" | "barn",
): number {
  const building = state[buildingKey];
  if (!building) return 0;
  if ((building.level ?? 0) <= 0) return 0;
  const { capacity } = getBoostedAnimalCapacity(buildingKey, state);
  const occupied = Object.keys(building.animals ?? {}).length;
  return Math.max(0, capacity - occupied);
}

// Build the "what's idle" feed shown in the IdlePanel. One entry per
// category that has free capacity right now (empty plots, idle
// buildings, free queue slots). Categories the player hasn't engaged
// with at all (no plots, no buildings of that type) are skipped so the
// panel stays a list of actionable opportunities, not a static
// checklist of "stuff you don't have".
export function buildIdleEntries(
  state: GameState,
  byCategory: Map<string, AggregatedTimer[]>,
  now: number,
): IdleEntry[] {
  const out: IdleEntry[] = [];

  // Plot-style categories: count placed-but-empty.
  const plotCounts: Array<{
    category: Category;
    placed: number;
    used: number;
    noun: string;
    pluralNoun?: string;
  }> = [
    {
      category: "Crops",
      placed: Object.keys(state.crops ?? {}).length,
      used: Object.values(state.crops ?? {}).filter((p) => !!p.crop).length,
      noun: "plot",
    },
    {
      category: "Fruit Patches",
      placed: Object.keys(state.fruitPatches ?? {}).length,
      used: Object.values(state.fruitPatches ?? {}).filter((p) => !!p.fruit)
        .length,
      noun: "patch",
      pluralNoun: "patches",
    },
    {
      category: "Flowers",
      placed: Object.keys(state.flowers?.flowerBeds ?? {}).length,
      used: Object.values(state.flowers?.flowerBeds ?? {}).filter(
        (b) => !!b.flower,
      ).length,
      noun: "bed",
    },
  ];

  for (const { category, placed, used, noun, pluralNoun } of plotCounts) {
    if (placed === 0) continue;
    const empty = placed - used;
    if (empty <= 0) continue;
    out.push({
      category,
      message: `${empty} ${pluralise(empty, noun, pluralNoun)} empty`,
    });
  }

  // Greenhouse: needs the building placed and at least one pot.
  const greenhousePlaced = (state.buildings?.Greenhouse ?? []).length > 0;
  const pots = state.greenhouse?.pots ?? {};
  const potsCount = Object.keys(pots).length;
  if (greenhousePlaced && potsCount > 0) {
    const usedPots = Object.values(pots).filter((p) => !!p.plant).length;
    const free = potsCount - usedPots;
    if (free > 0) {
      out.push({
        category: "Greenhouse",
        message: `${free} ${pluralise(free, "pot")} empty`,
      });
    }
  }

  // Crop Machine queue.
  const cmFree = cropMachineFree(state);
  if (cmFree > 0) {
    out.push({
      category: "Crop Machine",
      message: `${cmFree} pack ${pluralise(cmFree, "slot")} free`,
    });
  }

  // Cooking buildings: per-category queue slot count.
  for (const cat of COOKING_BUILDINGS) {
    const free = cookingBuildingFree(state, cat, now);
    if (free > 0) {
      out.push({
        category: cat,
        message: `${free} ${pluralise(free, "slot")} empty`,
      });
    }
  }

  // Fish Market processing queue.
  const fishFree = fishMarketFree(state, now);
  if (fishFree > 0) {
    out.push({
      category: "Fish Market",
      message: `${fishFree} ${pluralise(fishFree, "slot")} empty`,
    });
  }

  // Composters: each composter holds one job — sum the `count` of
  // every idle row. Composter rows aren't merged today (each instance
  // has its own aggregationKey, so count is always 1), but reading
  // `count` is the conventional way to consume aggregated timers and
  // stays correct if upstream ever shares keys across instances.
  const composters = byCategory.get("Composters") ?? [];
  const idleComposters = composters.reduce(
    (total, t) => total + (t.idle ? t.count : 0),
    0,
  );
  if (idleComposters > 0) {
    out.push({
      category: "Composters",
      message: `${idleComposters} ${pluralise(idleComposters, "composter")} idle`,
    });
  }

  // Aging Shed: one entry per rack so each shows up as its own row,
  // matching the per-rack categories in the main timer view.
  for (const rack of agingShedRacks(state)) {
    if (rack.free <= 0) continue;
    out.push({
      category: rack.category,
      message: `${rack.free} ${pluralise(rack.free, "slot")} free`,
    });
  }

  // Crafting Box: queue slot count.
  const craftFree = craftingBoxFree(state, now);
  if (craftFree > 0) {
    out.push({
      category: "Crafting Box",
      message: `${craftFree} ${pluralise(craftFree, "slot")} free`,
    });
  }

  // Animals: hen house + barn free slots.
  const henFree = animalBuildingFree(state, "henHouse");
  const barnFree = animalBuildingFree(state, "barn");
  const animalFree = henFree + barnFree;
  if (animalFree > 0) {
    out.push({
      category: "Animals",
      message: `${animalFree} animal ${pluralise(animalFree, "slot")} available`,
    });
  }

  return out;
}
