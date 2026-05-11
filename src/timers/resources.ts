import {
  CRIMSTONE_RECOVERY_TIME,
  GOLD_RECOVERY_TIME,
  IRON_RECOVERY_TIME,
  OIL_RESERVE_RECOVERY_TIME,
  STONE_RECOVERY_TIME,
  SUNSTONE_RECOVERY_TIME,
  TREE_RECOVERY_TIME,
  getCrimstoneYield,
  getGoldYield,
  getIronYield,
  getItemIcon,
  getOilYield,
  getStoneYield,
  getWoodYield,
  type FiniteResource,
  type GameState,
  type OilReserve,
  type Rock,
  type Tree,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// App-local kind label for the Resources panel — maps to upstream
// recovery constants below.
type ResourceKind =
  | "Wood"
  | "Stone"
  | "Iron"
  | "Gold"
  | "Crimstone"
  | "Sunstone"
  | "Oil";

const RECOVERY_SECONDS: Record<ResourceKind, number> = {
  Wood: TREE_RECOVERY_TIME,
  Stone: STONE_RECOVERY_TIME,
  Iron: IRON_RECOVERY_TIME,
  Gold: GOLD_RECOVERY_TIME,
  Crimstone: CRIMSTONE_RECOVERY_TIME,
  Sunstone: SUNSTONE_RECOVERY_TIME,
  Oil: OIL_RESERVE_RECOVERY_TIME,
};

// One card per resource type (Wood / Stone / Iron / Gold / Crimstone /
// Sunstone / Oil). Each node contributes one Timer with
// `aggregationKey: "Resources|<kind>"`, so the downstream aggregator
// sums `predictedYield.amount` across the group and takes the earliest
// `readyAt`. The card headline reads `<total> <kind>`.
//
// Ready check mirrors upstream:
//   `now > lastActionAt + RECOVERY_SECONDS * 1000`
// (chop.ts:60, stoneMine.ts canMine, etc.)
//
// Active-node check uses `x === undefined && y === undefined` —
// landscaped-away nodes have coords stripped. `removedAt` is unreliable
// (re-placed nodes carry stale timestamps).
//
// Sunstone has no upstream `getDropAmount`; mineSunstone.ts always
// awards 1 per mine, so the predictor here returns 1 too.

function pushResourceTimer(
  out: Timer[],
  kind: ResourceKind,
  nodeId: string,
  readyAt: number,
  yieldAmount: number,
): void {
  out.push({
    id: `resource:${kind}:${nodeId}`,
    category: "Resources",
    label: kind,
    icon: getItemIcon(kind),
    readyAt,
    predictedYield: { amount: yieldAmount, item: kind },
    aggregationKey: `Resources|${kind}`,
  });
}

function isPlaced(node: { x?: number; y?: number }): boolean {
  return node.x !== undefined || node.y !== undefined;
}

function safeYield<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function extractResourceTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const out: Timer[] = [];
  const farmId = ctx.farmId;

  // Wood
  const treeRecoveryMs = RECOVERY_SECONDS.Wood * 1000;
  for (const [nodeId, tree] of Object.entries(state.trees ?? {})) {
    if (!isPlaced(tree)) continue;
    const readyAt = tree.wood.choppedAt + treeRecoveryMs;
    const amount = safeYield(
      () =>
        getWoodYield({
          game: state,
          tree: tree as Tree,
          farmId,
          counter: ctx.counter.next(),
        }).amount,
      1,
    );
    pushResourceTimer(out, "Wood", nodeId, readyAt, amount);
  }

  // Stone / Iron / Gold (uniform Rock shape)
  const rockKinds: Array<{
    kind: ResourceKind;
    map: Record<string, Rock> | undefined;
    yieldFn: (rock: Rock, id: string, createdAt: number) => number;
  }> = [
    {
      kind: "Stone",
      map: state.stones,
      yieldFn: (rock, id, createdAt) =>
        safeYield(
          () =>
            getStoneYield({
              game: state,
              rock,
              id,
              createdAt,
              farmId,
              counter: ctx.counter.next(),
            }).amount,
          1,
        ),
    },
    {
      kind: "Iron",
      map: state.iron,
      yieldFn: (rock, _id, createdAt) =>
        safeYield(
          () =>
            getIronYield({
              game: state,
              rock,
              createdAt,
              farmId,
              counter: ctx.counter.next(),
            }).amount,
          1,
        ),
    },
    {
      kind: "Gold",
      map: state.gold,
      yieldFn: (rock, _id, createdAt) =>
        safeYield(
          () =>
            getGoldYield({
              game: state,
              rock,
              createdAt,
              farmId,
              counter: ctx.counter.next(),
            }).amount,
          1,
        ),
    },
  ];
  for (const { kind, map, yieldFn } of rockKinds) {
    const recoveryMs = RECOVERY_SECONDS[kind] * 1000;
    for (const [nodeId, rock] of Object.entries(map ?? {})) {
      if (!isPlaced(rock)) continue;
      const readyAt = rock.stone.minedAt + recoveryMs;
      const amount = yieldFn(rock, nodeId, Math.max(ctx.now, readyAt));
      pushResourceTimer(out, kind, nodeId, readyAt, amount);
    }
  }

  // Crimstone — FiniteResource, exhausted when minesLeft hits 0
  const crimstoneRecoveryMs = RECOVERY_SECONDS.Crimstone * 1000;
  for (const [nodeId, rock] of Object.entries(state.crimstones ?? {})) {
    if (!isPlaced(rock)) continue;
    if (rock.minesLeft <= 0) continue;
    const readyAt = rock.stone.minedAt + crimstoneRecoveryMs;
    const amount = safeYield(
      () =>
        getCrimstoneYield({
          game: state,
          rock: rock as FiniteResource,
        }).amount,
      1,
    );
    pushResourceTimer(out, "Crimstone", nodeId, readyAt, amount);
  }

  // Sunstone — always 1, no upstream predictor (mineSunstone.ts:59).
  // Still skip exhausted nodes.
  const sunstoneRecoveryMs = RECOVERY_SECONDS.Sunstone * 1000;
  for (const [nodeId, rock] of Object.entries(state.sunstones ?? {})) {
    if (!isPlaced(rock)) continue;
    if (rock.minesLeft <= 0) continue;
    const readyAt = rock.stone.minedAt + sunstoneRecoveryMs;
    pushResourceTimer(out, "Sunstone", nodeId, readyAt, 1);
  }

  // Oil
  const oilRecoveryMs = RECOVERY_SECONDS.Oil * 1000;
  for (const [nodeId, reserve] of Object.entries(state.oilReserves ?? {})) {
    if (!isPlaced(reserve)) continue;
    const readyAt = reserve.oil.drilledAt + oilRecoveryMs;
    const amount = safeYield(
      () =>
        getOilYield({ game: state, reserve: reserve as OilReserve }).amount,
      1,
    );
    pushResourceTimer(out, "Oil", nodeId, readyAt, amount);
  }

  return out;
}
