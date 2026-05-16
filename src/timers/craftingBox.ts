import { getItemIcon, type GameState } from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per queue slot in the Crafting Box. Unlike cooking
// buildings (which group slots inside one building card), each
// crafting job here gets its own card — the queue typically holds a
// small handful of slow-to-craft items, and players care about each
// one independently. Aggregation key encodes the queue slot id so
// reorders / removals don't collide.

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

  return queue.map((item) => ({
    id: `craftingBox:${item.id}`,
    category: "Crafting Box",
    label: item.name,
    icon: getItemIcon(item.name),
    readyAt: item.readyAt,
    predictedYield: { amount: 1, item: item.name },
    // Distinguish wearables vs collectibles so the player can tell at a
    // glance what kind of item is on the bench.
    subtext: item.type === "wearable" ? "Wearable" : "Collectible",
    // Unique per slot — keep each queue position as its own card.
    aggregationKey: `Crafting Box|${item.id}`,
  }));
}
