import {
  collectAgedFish,
  getFermentationRecipe,
  getItemIcon,
  getObjectEntries,
  getPrimeAgedChance,
  getSpiceRackRecipe,
  type AgingRackSlot,
  type FermentationJob,
  type FermentationRecipeName,
  type GameState,
  type InventoryItemName,
  type SpiceRackJob,
  type SpiceRackRecipeName,
} from "../game/index.ts";
import type { AgedFishName, PrimeAgedFishName } from "../game/types.ts";
import type { Category, Timer, TimerContext, TimerSlot } from "./types.ts";

// One Timer per Aging Shed rack — three total when the building is
// placed. Each rack is its own top-level Category so the layout flows
// them as independent panels (mirrors how cooking buildings are
// split):
//   • Aging Rack        — fish + salt → "Aged <fish>", with a per-slot
//                         chance to flip to "Prime Aged <fish>". The
//                         flip is a seeded-PRNG roll resolved by upstream
//                         at collect; we PREDICT it (see
//                         `predictPrimeFlips`) so the slot row shows the
//                         real outcome ahead of time.
//   • Fermentation Rack — recipe → recipe.outputs (first entry)
//   • Spice Rack        — recipe → recipe.outputs (first entry)
// Each card's `slots` field carries every in-flight job in that rack
// sorted by readyAt so the next-ready job is at the top. A rack with
// no jobs renders as an idle card (matching the cooking-building idle
// pattern).

const BUILDING_NAME = "Aging Shed";

// Predict which queued aging slots will collect as "Prime Aged" by
// dry-running the real upstream collect. We pass a `createdAt` past
// every slot's readyAt so the simulation drains the whole queue in one
// pass; `agingShed.lastAgingCollect` then carries one
// `{ item, primeAged }` per collected slot, in the queue's array order,
// so `results[i]` lines up with `racks.aging[i]`. Delegating to upstream
// keeps the seed math (per-fish counter, itemId, chance, threading) out
// of our codebase — when upstream changes a boost/gate the prediction
// follows with no edits here. The simulation runs on an immer copy, so
// the live state is untouched. Returns one boolean per slot (true =
// prime); any throw falls back to "all normal".
function predictPrimeFlips(state: GameState, farmId: number): boolean[] {
  const queue = state.agingShed?.racks?.aging ?? [];
  if (queue.length === 0) return [];
  try {
    const createdAt = Math.max(...queue.map((slot) => slot.readyAt)) + 1;
    const after = collectAgedFish({
      state,
      action: { type: "agingRack.collected" },
      createdAt,
      farmId,
    });
    const results = after.agingShed?.lastAgingCollect ?? [];
    return queue.map((_, i) => results[i]?.primeAged ?? false);
  } catch {
    return queue.map(() => false);
  }
}

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

function agingSlotEntry(slot: AgingRackSlot, prime: boolean): TimerSlot {
  // Output is `Aged ${fish}`, but a seeded-PRNG roll (resolved by
  // upstream at collect, predicted here) can flip it to `Prime Aged
  // ${fish}`. The prime item name + icon is signal enough on its own,
  // so we just swap the name; no extra chip. Both literals are upstream
  // fish names within InventoryItemName (via the CookableName union).
  const item: AgedFishName | PrimeAgedFishName = prime
    ? `Prime Aged ${slot.fish}`
    : `Aged ${slot.fish}`;
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
  // Headline note for the active card (e.g. the Aging Rack's prime-aged
  // chance). Omitted on idle cards.
  subtext?: string;
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
    subtext: rack.subtext,
    aggregationKey: `${rack.category}|${rack.rackKey}`,
  };
}

export function extractAgingShedTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  // Skip if the building isn't placed. `state.buildings["Aging Shed"]`
  // tracks placement coordinates; `state.agingShed` holds the racks
  // (always present in the save shape even when the building isn't
  // built yet).
  const placedBuildings = state.buildings?.[BUILDING_NAME] ?? [];
  const placed = placedBuildings.some((b) => !!b.coordinates);
  if (!placed) return [];

  const racks = state.agingShed?.racks;

  const agingQueue = racks?.aging ?? [];
  const primeFlips = predictPrimeFlips(state, ctx.farmId);
  const agingSlots: TimerSlot[] = agingQueue.map((slot, i) =>
    agingSlotEntry(slot, primeFlips[i] ?? false),
  );
  // Headline "rate": the chance each collect flips to Prime Aged, with
  // the player's current skills/sculptures (Fish Smoking, Salt Sculpture)
  // folded in by upstream. Only shown when fish are actually aging.
  const primeChance = Math.round(getPrimeAgedChance(state));
  const agingSubtext =
    agingQueue.length > 0 ? `Prime chance: ${primeChance}%` : undefined;
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
      subtext: agingSubtext,
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
