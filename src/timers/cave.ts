import {
  BEETLES,
  CAVE_PATCH_TILE_COUNT,
  getItemIcon,
  isCaveBuildingReady,
  isCavePatchCleared,
  type CaveRecipeName,
  type GameState,
  type InventoryItemName,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One card per Myco Bin in the Cave. Each Cave tier adds one machine,
// keyed by its tier ("1".."8"), sitting above its own 5x5 digging patch.
//
// A machine is in one of three states:
//   - growing — a batch is running: count down to `batch.readyAt`, which
//     the server stamps at start with every duration boost folded in (and
//     a gem speed-up rewrites to "now"), so it's read as-is;
//   - ready   — the patch can be dug: the card sits ready and shows how
//     many of the 25 tiles are dug so far;
//   - idle    — no batch, or every tile dug: the machine is free.
//
// Deliberately NOT shown: anything about what's buried where, or how many
// Beetles are left. Both come from the batch's board seed, which the
// community API strips (only the owner's session carries it), and helping
// players read the board is out of bounds for community tools anyway. The
// side effect is that a patch the player may already replace — every Beetle
// found, upstream's `canRestartCaveBatch` — still reads as "ready" here,
// because telling it apart needs the seed.

const MACHINE_NAME = "Myco Bin";

// The item each recipe's card shows. Display only: the Beetle recipe takes
// the commonest Beetle so a rename upstream follows through `BEETLES`.
const RECIPE_ICON: Record<CaveRecipeName, InventoryItemName> = {
  Mushroom: "Wild Mushroom",
  Beetle: BEETLES[0],
  Mud: "Mud",
};

export function extractCaveTimers(
  state: GameState,
  { now }: TimerContext,
): Timer[] {
  const cave = state.cave;
  // `cave` exists from the moment the building is bought, but every
  // cave.* event refuses until it's built and placed — so until then
  // there's nothing to show and the section stays hidden
  // (PLACEMENT_GATED_CATEGORIES).
  if (!cave || !isCaveBuildingReady(state, now)) return [];

  const ids = Object.keys(cave.machines).sort((a, b) => Number(a) - Number(b));

  return ids.map((id): Timer => {
    const name = `${MACHINE_NAME} ${id}`;
    const batch = cave.machines[id].batch;
    const aggregationKey = `Cave|${id}`;

    if (!batch || isCavePatchCleared(batch)) {
      return {
        id: `cave-${id}`,
        category: "Cave",
        label: name,
        icon: getItemIcon("Wild Mushroom"),
        readyAt: 0,
        idle: true,
        idleText: batch ? "Patch cleared" : "Empty",
        aggregationKey,
      };
    }

    const dug = Object.keys(batch.dug ?? {}).length;
    const growing = batch.readyAt > now;

    return {
      id: `cave-${id}`,
      category: "Cave",
      label: `${batch.recipe} patch`,
      icon: getItemIcon(RECIPE_ICON[batch.recipe]),
      readyAt: batch.readyAt,
      subtext: growing ? name : `${name} · ${dug}/${CAVE_PATCH_TILE_COUNT} dug`,
      nodeLabel: MACHINE_NAME,
      pushTitle: `${batch.recipe} patch ready to dig`,
      pushBody: `${name} · Cave`,
      aggregationKey,
    };
  });
}
