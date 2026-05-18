import {
  CRIMSTONE_RECOVERY_TIME,
  CROPS,
  FLOWERS,
  GOLD_RECOVERY_TIME,
  GREENHOUSE_CROPS,
  IRON_RECOVERY_TIME,
  OIL_RESERVE_RECOVERY_TIME,
  PATCH_FRUIT,
  STONE_RECOVERY_TIME,
  SUNSTONE_RECOVERY_TIME,
  TREE_RECOVERY_TIME,
  batchCrimstoneYields,
  batchGoldYields,
  batchIronYields,
  batchOilYields,
  batchStoneYields,
  batchSunstoneYields,
  batchWoodYields,
  getItemIcon,
  getKeys,
  type CropName,
  type FiniteResource,
  type FlowerName,
  type GameState,
  type OilReserve,
  type Rock,
  type RockName,
  type Tree,
  type TreeName,
} from "../game/index.ts";
import type {
  AnimalResource,
  GreenHouseCropName,
  GreenhousePlantName,
  PatchFruitName,
} from "../game/types.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// One card per resource type. Each resource's batch yield helper threads
// AOE + counter the same way `bulkHarvest` / `bulkChop` would on harvest
// — see src/game/batch-yields.ts.
//
// Active-node check: `x !== undefined || y !== undefined` — landscaped
// away nodes have coords stripped (matches upstream `getActiveResources`
// pattern).

type ResourceName =
  | "Wood"
  | "Stone"
  | "Iron"
  | "Gold"
  | "Crimstone"
  | "Sunstone"
  | "Oil";

type ResourceKind =
  | ResourceName
  | CropName
  | PatchFruitName
  | GreenhousePlantName
  | FlowerName
  | "Honey"
  | "Salt"
  | "Salt Charged"
  | AnimalResource;

const RECOVERY_SECONDS: Record<ResourceName, number> = {
  Wood: TREE_RECOVERY_TIME,
  Stone: STONE_RECOVERY_TIME,
  Iron: IRON_RECOVERY_TIME,
  Gold: GOLD_RECOVERY_TIME,
  Crimstone: CRIMSTONE_RECOVERY_TIME,
  Sunstone: SUNSTONE_RECOVERY_TIME,
  Oil: OIL_RESERVE_RECOVERY_TIME,
};

// Canonical node name per produced item. Used by the notification
// scheduler to render "4.2 Wood from 3× Tree" so the count clearly
// modifies the source, not the yield. Per-extractor lookup, keyed on
// the item the player actually receives (Wood, Sunflower, Egg, …).
// Names mostly come from upstream `ResourceName` in
// sunflower-land/.../game/types/resources.ts; animal node names come
// from `AnimalType` and the salt node label is overview-coined since
// upstream has no collectible for it.
export const NODE_LABEL: Record<ResourceKind, string> = {
  Wood: "Tree",
  Stone: "Stone Rock",
  Iron: "Iron Rock",
  Gold: "Gold Rock",
  Crimstone: "Crimstone Rock",
  Sunstone: "Sunstone Rock",
  Oil: "Oil Reserve",
  ...getKeys(CROPS).reduce(
    (acc, crop) => ({ ...acc, [crop]: "Crop Plot" }),
    {} as Record<CropName, ResourceName>,
  ),
  ...getKeys(GREENHOUSE_CROPS).reduce(
    (acc, crop) => ({ ...acc, [crop]: "Greenhouse" }),
    {} as Record<GreenHouseCropName, ResourceName>,
  ),
  ...getKeys(PATCH_FRUIT).reduce(
    (acc, fruit) => ({ ...acc, [fruit]: "Fruit Patch" }),
    {} as Record<PatchFruitName, ResourceName>,
  ),
  Grape: "Greenhouse",
  ...getKeys(FLOWERS).reduce(
    (acc, flower) => ({ ...acc, [flower]: "Flower Bed" }),
    {} as Record<FlowerName, string>,
  ),
  Honey: "Beehive",
  Salt: "Salt Node",
  "Salt Charged": "Salt Node",
  // Animal resources → source species. Two resources per species: Egg /
  // Feather from Chicken, Milk / Leather from Cow, Wool / Merino Wool
  // from Sheep.
  Egg: "Chicken",
  Feather: "Chicken",
  Milk: "Cow",
  Leather: "Cow",
  Wool: "Sheep",
  "Merino Wool": "Sheep",
} satisfies Record<ResourceKind, string>;

function pushResourceTimer(
  out: Timer[],
  kind: ResourceName,
  nodeId: string,
  readyAt: number,
  yieldAmount: number,
  boosts?: Boost[],
): void {
  out.push({
    id: `resource:${kind}:${nodeId}`,
    category: "Resources",
    label: kind,
    icon: getItemIcon(kind),
    readyAt,
    predictedYield: { amount: yieldAmount, item: kind },
    boosts,
    aggregationKey: `Resources|${kind}`,
    nodeLabel: NODE_LABEL[kind],
  });
}

function isPlaced(node: { x?: number; y?: number }): boolean {
  return node.x !== undefined || node.y !== undefined;
}

export function extractResourceTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const out: Timer[] = [];
  const farmId = ctx.farmId;

  // --- Trees / Wood ---
  // Group by tree.name (or "Tree" default) so each variant's counter +
  // AOE thread independently.
  const treesByName = new Map<
    TreeName,
    Array<{ nodeId: string; tree: Tree; readyAt: number }>
  >();
  for (const [nodeId, tree] of Object.entries(state.trees ?? {})) {
    if (!isPlaced(tree)) continue;
    const treeName: TreeName = tree.name ?? "Tree";
    const readyAt = tree.wood.choppedAt + RECOVERY_SECONDS.Wood * 1000;
    const list = treesByName.get(treeName) ?? [];
    list.push({ nodeId, tree, readyAt });
    treesByName.set(treeName, list);
  }
  for (const [treeName, group] of treesByName) {
    group.sort((a, b) => a.readyAt - b.readyAt);
    const yields = batchWoodYields({
      game: state,
      treeName,
      trees: group.map(({ nodeId, tree }) => ({ nodeId, tree })),
      farmId,
    });
    for (const { nodeId, readyAt } of group) {
      const entry = yields.get(nodeId);
      pushResourceTimer(
        out,
        "Wood",
        nodeId,
        readyAt,
        entry?.amount ?? 1,
        entry?.boosts,
      );
    }
  }

  // --- Rocks (Stone / Iron / Gold) ---
  const rockConfigs: Array<{
    kind: ResourceName;
    map: Record<string, Rock> | undefined;
    defaultName: RockName;
    batch:
      | typeof batchStoneYields
      | typeof batchIronYields
      | typeof batchGoldYields;
  }> = [
    {
      kind: "Stone",
      map: state.stones,
      defaultName: "Stone Rock",
      batch: batchStoneYields,
    },
    {
      kind: "Iron",
      map: state.iron,
      defaultName: "Iron Rock",
      batch: batchIronYields,
    },
    {
      kind: "Gold",
      map: state.gold,
      defaultName: "Gold Rock",
      batch: batchGoldYields,
    },
  ];
  for (const { kind, map, defaultName, batch } of rockConfigs) {
    const recoveryMs = RECOVERY_SECONDS[kind] * 1000;
    const byName = new Map<
      RockName,
      Array<{ nodeId: string; rock: Rock; readyAt: number }>
    >();
    for (const [nodeId, rock] of Object.entries(map ?? {})) {
      if (!isPlaced(rock)) continue;
      const rockName: RockName = rock.name ?? defaultName;
      const readyAt = rock.stone.minedAt + recoveryMs;
      const list = byName.get(rockName) ?? [];
      list.push({ nodeId, rock, readyAt });
      byName.set(rockName, list);
    }
    for (const [rockName, group] of byName) {
      group.sort((a, b) => a.readyAt - b.readyAt);
      const yields = batch({
        game: state,
        rockName,
        rocks: group.map(({ nodeId, rock, readyAt }) => ({
          nodeId,
          rock,
          createdAt: Math.max(ctx.now, readyAt),
        })),
        farmId,
      });
      for (const { nodeId, readyAt } of group) {
        const entry = yields.get(nodeId);
        pushResourceTimer(
          out,
          kind,
          nodeId,
          readyAt,
          entry?.amount ?? 1,
          entry?.boosts,
        );
      }
    }
  }

  // --- Crimstone (FiniteResource; no PRNG counter advance) ---
  const crimstoneRecoveryMs = RECOVERY_SECONDS.Crimstone * 1000;
  const crimstones: Array<{
    nodeId: string;
    rock: FiniteResource;
    readyAt: number;
  }> = [];
  for (const [nodeId, rock] of Object.entries(state.crimstones ?? {})) {
    if (!isPlaced(rock)) continue;
    if (rock.minesLeft <= 0) continue;
    crimstones.push({
      nodeId,
      rock,
      readyAt: rock.stone.minedAt + crimstoneRecoveryMs,
    });
  }
  const crimstoneYields = batchCrimstoneYields({
    game: state,
    rocks: crimstones.map(({ nodeId, rock }) => ({ nodeId, rock })),
  });
  for (const { nodeId, readyAt } of crimstones) {
    const entry = crimstoneYields.get(nodeId);
    pushResourceTimer(
      out,
      "Crimstone",
      nodeId,
      readyAt,
      entry?.amount ?? 1,
      entry?.boosts,
    );
  }

  // --- Sunstone (always 1) ---
  const sunstoneRecoveryMs = RECOVERY_SECONDS.Sunstone * 1000;
  const sunstones: Array<{ nodeId: string; readyAt: number }> = [];
  for (const [nodeId, rock] of Object.entries(state.sunstones ?? {})) {
    if (!isPlaced(rock)) continue;
    if (rock.minesLeft <= 0) continue;
    sunstones.push({
      nodeId,
      readyAt: rock.stone.minedAt + sunstoneRecoveryMs,
    });
  }
  const sunstoneYields = batchSunstoneYields({
    rocks: sunstones.map(({ nodeId }) => ({ nodeId })),
  });
  for (const { nodeId, readyAt } of sunstones) {
    const entry = sunstoneYields.get(nodeId);
    pushResourceTimer(
      out,
      "Sunstone",
      nodeId,
      readyAt,
      entry?.amount ?? 1,
      entry?.boosts,
    );
  }

  // --- Oil ---
  const oilRecoveryMs = RECOVERY_SECONDS.Oil * 1000;
  const oilEntries: Array<{
    nodeId: string;
    reserve: OilReserve;
    readyAt: number;
  }> = [];
  for (const [nodeId, reserve] of Object.entries(state.oilReserves ?? {})) {
    if (!isPlaced(reserve)) continue;
    oilEntries.push({
      nodeId,
      reserve,
      readyAt: reserve.oil.drilledAt + oilRecoveryMs,
    });
  }
  const oilYields = batchOilYields({
    game: state,
    reserves: oilEntries.map(({ nodeId, reserve }) => ({ nodeId, reserve })),
  });
  for (const { nodeId, readyAt } of oilEntries) {
    const entry = oilYields.get(nodeId);
    pushResourceTimer(
      out,
      "Oil",
      nodeId,
      readyAt,
      entry?.amount ?? 1,
      entry?.boosts,
    );
  }

  return out;
}
