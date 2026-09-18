import {
  getCraftingQueueReadyAts,
  getItemIcon,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per queue slot in the Crafting Box. Unlike cooking
// buildings (which group slots inside one building card), each
// crafting job here gets its own card — the queue typically holds a
// small handful of slow-to-craft items, and players care about each
// one independently. Aggregation key encodes the queue slot id so
// reorders / removals don't collide.
//
// Ready times come from upstream's `getCraftingQueueReadyAts`, NOT from
// each item's stored `readyAt`. Crafting moved onto the windowed
// speed-rate model in #7654 — Super / Time Warp Totem at 2x and Fox
// Shrine at 1.35x are live speeds over the queue rather than discounts
// baked in at craft time — and like cooking it is SEQUENTIAL, so one
// placed mid-craft pulls everything behind it forward too. That makes
// the stored value a cache that goes stale between queue writes.
// Legacy items (no `baseDurationMs`) fall back to their stored value
// inside the helper, so a part-migrated queue resolves correctly.

const BUILDING_NAME = "Crafting Box";

export function extractCraftingBoxTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  // Skip if the box isn't placed. State carries `craftingBox` even when
  // the building isn't built yet.
  const placedBuildings = state.buildings?.[BUILDING_NAME] ?? [];
  const placed = placedBuildings.some((b) => !!b.coordinates);
  if (!placed) return [];

  const queue = state.craftingBox?.queue ?? [];

  if (queue.length === 0) {
    return [
      {
        id: `craftingBox:idle`,
        category: "Crafting Box",
        label: BUILDING_NAME,
        icon: getItemIcon(BUILDING_NAME),
        readyAt: 0,
        idle: true,
        idleText: "Not crafting",
        aggregationKey: `Crafting Box|idle`,
      },
    ];
  }

  // Resolve the whole queue at once — a chained craft's start is the
  // derived time the box frees up, so it cannot be derived per slot.
  const readyAts = getCraftingQueueReadyAts({ queue, game: state });

  return queue.map((item, slotIdx) => ({
    id: `craftingBox:${item.id}`,
    category: "Crafting Box",
    label: item.name,
    icon: getItemIcon(item.name),
    readyAt: readyAts[slotIdx] ?? item.readyAt,
    predictedYield: { amount: 1, item: item.name },
    // Distinguish wearables vs collectibles so the player can tell at a
    // glance what kind of item is on the bench.
    subtext: item.type === "wearable" ? "Wearable" : "Collectible",
    // Unique per slot — keep each queue position as its own card.
    aggregationKey: `Crafting Box|${item.id}`,
  }));
}
