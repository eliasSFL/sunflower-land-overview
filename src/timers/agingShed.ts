import {
  getFermentationRecipe,
  getItemIcon,
  getObjectEntries,
  getSpiceRackRecipe,
  type AgingRackSlot,
  type FermentationJob,
  type FermentationRecipeName,
  type GameState,
  type InventoryItemName,
  type SpiceRackJob,
  type SpiceRackRecipeName,
} from "../game/index.ts";
import type { AgedFishName } from "../game/types.ts";
import type { Category, Timer, TimerContext, TimerSlot } from "./types.ts";

// One Timer per Aging Shed rack — three total when the building is
// placed. Each rack is its own top-level Category so the layout flows
// them as independent panels (mirrors how cooking buildings are
// split):
//   • Aging Rack        — fish + salt → "Aged <fish>" (Prime Aged PRNG
//                         flip rolled at collect; we don't predict it)
//   • Fermentation Rack — recipe → recipe.outputs (first entry)
//   • Spice Rack        — recipe → recipe.outputs (first entry)
// Each card's `slots` field carries every in-flight job in that rack
// sorted by readyAt so the next-ready job is at the top. A rack with
// no jobs renders as an idle card (matching the cooking-building idle
// pattern).

const BUILDING_NAME = "Aging Shed";

function fermentationOutput(
  recipe: FermentationRecipeName,
): { item: InventoryItemName; amount: number } | undefined {
  try {
    const def = getFermentationRecipe(recipe);
    const entries = getObjectEntries(def?.outputs ?? {});
    if (entries.length === 0) return undefined;
    const [item, decimal] = entries[0];
    return { item, amount: decimal?.toNumber?.() ?? 1 };
  } catch {
    return undefined;
  }
}

function spiceOutput(
  recipe: SpiceRackRecipeName,
): { item: InventoryItemName; amount: number } | undefined {
  try {
    const def = getSpiceRackRecipe(recipe);
    const entries = getObjectEntries(def?.outputs ?? {});
    if (entries.length === 0) return undefined;
    const [item, decimal] = entries[0];
    return { item, amount: decimal?.toNumber?.() ?? 1 };
  } catch {
    return undefined;
  }
}

function agingSlotEntry(slot: AgingRackSlot): TimerSlot {
  // Aged fish output is `Aged ${fish}` — Prime Aged is a PRNG flip
  // resolved on collect; we show the conservative "Aged" name. The
  // `Aged ${FishName}` literal is an upstream AgedFishName, which is
  // part of InventoryItemName via the CookableName union.
  const item: AgedFishName = `Aged ${slot.fish}`;
  return {
    item,
    icon: getItemIcon(item),
    amount: 1,
    readyAt: slot.readyAt,
  };
}

function fermentationSlotEntry(job: FermentationJob): TimerSlot | undefined {
  const out = fermentationOutput(job.recipe);
  if (!out) return undefined;
  return {
    item: out.item,
    icon: getItemIcon(out.item),
    amount: out.amount,
    readyAt: job.readyAt,
  };
}

function spiceSlotEntry(job: SpiceRackJob): TimerSlot | undefined {
  const out = spiceOutput(job.recipe);
  if (!out) return undefined;
  return {
    item: out.item,
    icon: getItemIcon(out.item),
    amount: out.amount,
    readyAt: job.readyAt,
  };
}

type RackCard = {
  rackKey: "aging" | "fermentation" | "spice";
  category: Category;
  idleText: string;
  slots: TimerSlot[];
};

function buildRackCard(rack: RackCard): Timer {
  const buildingIcon = getItemIcon(BUILDING_NAME);
  const sortedSlots = [...rack.slots].sort((a, b) => a.readyAt - b.readyAt);
  if (sortedSlots.length === 0) {
    return {
      id: `agingShed:${rack.rackKey}:idle`,
      category: rack.category,
      label: rack.category,
      icon: buildingIcon,
      readyAt: 0,
      idle: true,
      idleText: rack.idleText,
      aggregationKey: `${rack.category}|${rack.rackKey}`,
    };
  }
  return {
    id: `agingShed:${rack.rackKey}:active`,
    category: rack.category,
    label: rack.category,
    icon: buildingIcon,
    readyAt: sortedSlots[0].readyAt,
    slots: sortedSlots,
    aggregationKey: `${rack.category}|${rack.rackKey}`,
  };
}

export function extractAgingShedTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  // Skip if the building isn't placed. `state.buildings["Aging Shed"]`
  // tracks placement coordinates; `state.agingShed` holds the racks
  // (always present in the save shape even when the building isn't
  // built yet).
  const placedBuildings = state.buildings?.[BUILDING_NAME] ?? [];
  const placed = placedBuildings.some((b) => !!b.coordinates);
  if (!placed) return [];

  const racks = state.agingShed?.racks;

  const agingSlots: TimerSlot[] = (racks?.aging ?? []).map(agingSlotEntry);
  const fermentationSlots: TimerSlot[] = [];
  for (const job of racks?.fermentation ?? []) {
    const entry = fermentationSlotEntry(job);
    if (entry) fermentationSlots.push(entry);
  }
  const spiceSlots: TimerSlot[] = [];
  for (const job of racks?.spice ?? []) {
    const entry = spiceSlotEntry(job);
    if (entry) spiceSlots.push(entry);
  }

  return [
    buildRackCard({
      rackKey: "aging",
      category: "Aging Rack",
      idleText: "No fish aging",
      slots: agingSlots,
    }),
    buildRackCard({
      rackKey: "fermentation",
      category: "Fermentation Rack",
      idleText: "Not fermenting",
      slots: fermentationSlots,
    }),
    buildRackCard({
      rackKey: "spice",
      category: "Spice Rack",
      idleText: "Not spicing",
      slots: spiceSlots,
    }),
  ];
}
