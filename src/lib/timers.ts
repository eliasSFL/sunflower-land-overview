import type { GameState, Rock } from "../types";
import {
  CRIMSTONE_RECOVERY_SECONDS,
  CROP_SECONDS,
  FLOWER_SECONDS,
  GOLD_RECOVERY_SECONDS,
  GREENHOUSE_CROP_SECONDS,
  GREENHOUSE_FRUIT_SECONDS,
  HONEY_FULL_SECONDS,
  IRON_RECOVERY_SECONDS,
  MUSHROOM_SPAWN_SECONDS,
  OIL_RESERVE_RECOVERY_SECONDS,
  PATCH_FRUIT_SECONDS,
  STONE_RECOVERY_SECONDS,
  SUNSTONE_RECOVERY_SECONDS,
  TREE_RECOVERY_SECONDS,
} from "./durations";
import { formatYield } from "./format";
import {
  predictAgingShed,
  predictAnimalProduce,
  predictBeehive,
  predictCrabTrap,
  predictCrimstone,
  predictCrop,
  predictCropMachinePack,
  predictFlower,
  predictFruit,
  predictGold,
  predictGreenhouse,
  predictIron,
  predictLavaPit,
  predictMushroom,
  predictOil,
  predictSaltNode,
  predictSaltPerRake,
  predictStone,
  predictSunstone,
  predictTree,
} from "./yields";

export type TimerCategory =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Cooking"
  | "Composters"
  | "Animals"
  | "Flowers"
  | "Beehives"
  | "Resources"
  | "Mushrooms"
  | "Aging Shed"
  | "Crafting"
  | "Crop Machine"
  | "Lava Pits"
  | "Crab Traps"
  | "Salt Nodes"
  | "Daily Rewards"
  | "Bounties";

export type Timer = {
  category: TimerCategory;
  label: string;
  sublabel?: string;
  /** Absolute target time in ms since epoch. */
  readyAt: number;
  /** True if the timer is "expires at" rather than "ready at". */
  isDeadline?: boolean;
  /** When set, the UI replaces the formatted countdown with this string —
   * used for static states like a salt node that's already at max charges. */
  displayOverride?: string;
  /** Source object id when available — useful for stable keys. */
  key: string;
  /** Predicted yield for this single item. Omitted when prediction is N/A
   * (e.g. cooking, bounties) or the predictor failed defensively. Aggregation
   * sums these into AggregatedTimer.totalPredictedYield. */
  predictedYield?: number;
  /** Override the default `${category}|${label}` aggregation grouping. Set
   * to a unique value to opt OUT of merging — used by Crop Machine so each
   * pack stays on its own card even when multiple packs grow the same crop. */
  aggregationKey?: string;
};

export function extractTimers(
  state: GameState | undefined,
  farmId = 0,
): Timer[] {
  if (!state) return [];
  const timers: Timer[] = [];

  // ── Predictive farmActivity counter ────────────────────────────────────
  // Game `farmActivity[`${name} Verb`]` increments by 1 per harvest. When
  // we predict N items of the same activity in one extraction pass we have
  // to *advance* the counter for each subsequent item, otherwise every
  // identical chance roll resolves the same way (all hit or all miss) and
  // the summed prediction is biased.
  //
  // `nextCounter("Soybean Harvested", farmActivity)` returns the right
  // counter for the i-th Soybean we emit and bumps the local sequence.
  const farmActivity =
    (state as { farmActivity?: Record<string, number> }).farmActivity ?? {};
  const sequenceCounters = new Map<string, number>();
  const nextCounter = (activityName: string): number => {
    const base = farmActivity[activityName] ?? 0;
    const seq = sequenceCounters.get(activityName) ?? 0;
    sequenceCounters.set(activityName, seq + 1);
    return base + seq;
  };

  // Crops
  for (const [id, plot] of Object.entries(state.crops ?? {})) {
    const crop = plot.crop;
    if (!crop) continue;
    const seconds = CROP_SECONDS[crop.name];
    if (!seconds) continue;
    const readyAt = crop.plantedAt + seconds * 1000;
    timers.push({
      category: "Crops",
      label: crop.name,
      sublabel: `Plot ${id}`,
      readyAt,
      key: `crop-${id}`,
      predictedYield:
        predictCrop(
          state,
          id,
          readyAt,
          farmId,
          nextCounter(`${crop.name} Harvested`),
        ) ?? undefined,
    });
  }

  // Fruit patches
  for (const [id, patch] of Object.entries(state.fruitPatches ?? {})) {
    const fruit = patch.fruit;
    if (!fruit) continue;
    const seconds = PATCH_FRUIT_SECONDS[fruit.name];
    if (!seconds) continue;
    // Patch fruit yields multiple harvests. After each harvest the game
    // sets `harvestedAt` to mark when replenishment started; that becomes
    // the binding constraint for the next ready time. `plantedAt` only
    // governs the very first cycle. (See fruitHarvested.ts ~line 330 in
    // the merged subtree.)
    const harvestedAt = (fruit as { harvestedAt?: number }).harvestedAt ?? 0;
    const baseTime = Math.max(fruit.plantedAt, harvestedAt);
    const readyAt = baseTime + seconds * 1000;
    timers.push({
      category: "Fruit Patches",
      label: fruit.name,
      sublabel:
        fruit.harvestsLeft != null
          ? `Patch ${id} · ${fruit.harvestsLeft} left`
          : `Patch ${id}`,
      readyAt,
      key: `fruit-${id}`,
      predictedYield:
        predictFruit(
          state,
          id,
          readyAt,
          farmId,
          nextCounter(`${fruit.name} Harvested`),
        ) ?? undefined,
    });
  }

  // Greenhouse pots
  for (const [id, pot] of Object.entries(state.greenhouse?.pots ?? {})) {
    const plant = pot.plant;
    if (!plant) continue;
    const seconds =
      GREENHOUSE_CROP_SECONDS[plant.name] ??
      GREENHOUSE_FRUIT_SECONDS[plant.name];
    if (!seconds) continue;
    const readyAt = plant.plantedAt + seconds * 1000;
    timers.push({
      category: "Greenhouse",
      label: plant.name,
      sublabel: `Pot ${id}`,
      readyAt,
      key: `greenhouse-${id}`,
      predictedYield:
        predictGreenhouse(
          state,
          id,
          readyAt,
          farmId,
          nextCounter(`${plant.name} Harvested`),
        ) ?? undefined,
    });
  }

  // Cooking buildings
  const COOKING_BUILDINGS = new Set([
    "Fire Pit",
    "Kitchen",
    "Bakery",
    "Deli",
    "Smoothie Shack",
  ]);
  for (const [name, list] of Object.entries(state.buildings ?? {})) {
    if (!COOKING_BUILDINGS.has(name)) continue;
    list.forEach((b, idx) => {
      // Sublabel is just the building name (with #N when there's more than
      // one of that type). The queue index used to be here but it gets
      // collapsed by aggregation anyway — what the player wants to know is
      // *which building* is cooking the recipe, not which queue slot.
      const buildingLabel = list.length > 1 ? `${name} #${idx + 1}` : name;
      (b.crafting ?? []).forEach((recipe, qIdx) => {
        if (!recipe?.readyAt) return;
        timers.push({
          category: "Cooking",
          label: recipe.name,
          sublabel: buildingLabel,
          readyAt: recipe.readyAt,
          key: `cook-${name}-${idx}-${qIdx}`,
        });
      });
    });
  }

  // Composters
  const COMPOSTERS = new Set([
    "Compost Bin",
    "Turbo Composter",
    "Premium Composter",
  ]);
  for (const [name, list] of Object.entries(state.buildings ?? {})) {
    if (!COMPOSTERS.has(name)) continue;
    list.forEach((b, idx) => {
      const ready = b.producing?.readyAt;
      if (!ready || !b.producing?.name) return;
      timers.push({
        category: "Composters",
        label: b.producing.name,
        sublabel: `${name}${list.length > 1 ? ` #${idx + 1}` : ""}`,
        readyAt: ready,
        key: `compost-${name}-${idx}`,
      });
    });
  }

  // Animals (henHouse + barn)
  const animalBuildings: Array<["henHouse" | "barn", typeof state.henHouse]> = [
    ["henHouse", state.henHouse],
    ["barn", state.barn],
  ];
  for (const [building, b] of animalBuildings) {
    for (const [id, animal] of Object.entries(b?.animals ?? {})) {
      if (!animal.awakeAt) continue;
      const produce = predictAnimalProduce(state, building, id);
      timers.push({
        category: "Animals",
        label: animal.type,
        sublabel: `${building === "henHouse" ? "Hen House" : "Barn"} · ${animal.state}`,
        readyAt: animal.awakeAt,
        key: `animal-${id}`,
        predictedYield: produce?.amount,
      });
    }
  }

  // Flowers — flower bed stores the produced flower name; the duration is
  // derived from the flower's seed family (FLOWER_SECONDS table).
  for (const [id, bed] of Object.entries(state.flowers?.flowerBeds ?? {})) {
    const flower = bed.flower;
    if (!flower) continue;
    const seconds = FLOWER_SECONDS[flower.name];
    if (!seconds) continue;
    timers.push({
      category: "Flowers",
      label: flower.name,
      readyAt: flower.plantedAt + seconds * 1000,
      key: `flower-${id}`,
      predictedYield: predictFlower(state, id) ?? undefined,
    });
  }

  // Beehives — one card per hive (like Salt Nodes), labelled "Beehive 1",
  // "Beehive 2", … so they don't aggregate. The sublabel surfaces the
  // currently stored honey so the player can see at a glance which hives
  // are worth harvesting now vs. waiting on.
  //
  // Honey production is fully deterministic given the hive's attached
  // flowers. Each entry in `hive.flowers` carries a fixed [attachedAt,
  // attachedUntil) window and a per-ms rate; the game's updateBeehives
  // allocates these windows up front, so we don't need to guess. Walk the
  // schedule chronologically until the cumulative produced (in elapsed-
  // ms-equivalent) reaches one full production cycle (HONEY_FULL_SECONDS ×
  // 1000 ms).
  //
  // Note `honey.produced` is stored in *milliseconds* — full hive ==
  // HONEY_FULL_MS, NOT 1.0.
  const HONEY_FULL_MS = HONEY_FULL_SECONDS * 1000;
  const beehiveIds = Object.keys(state.beehives ?? {}).sort(
    // Numeric sort so "10" doesn't come before "2" in the per-hive labels.
    (a, b) => Number(a) - Number(b),
  );
  beehiveIds.forEach((id, idx) => {
    const hive = state.beehives![id];
    const honey = hive.honey;
    if (!honey) return;
    const producedMs = honey.produced ?? 0;
    const fullness = Math.min(1, producedMs / HONEY_FULL_MS);
    const isFull = producedMs >= HONEY_FULL_MS;
    // predictBeehive applies the player's honey multiplier to the current
    // fraction; that's what they'd actually receive on harvest now.
    const currentHoney = predictBeehive(state, id) ?? fullness;

    let readyAt: number = Date.now();
    let displayOverride: string | undefined;
    if (isFull) {
      displayOverride = "Ready";
    } else if (honey.updatedAt) {
      // Game accrues honey contiguously starting at `updatedAt`, capped by
      // each flower's [attachedAt, attachedUntil) window. Sort by attachedAt
      // to walk the timeline in order; anything ending before updatedAt has
      // already been counted into `produced`.
      const flowers = (hive.flowers ?? [])
        .slice()
        .sort((a, b) => a.attachedAt - b.attachedAt);
      let accrued = producedMs;
      let computed: number | undefined;
      for (const f of flowers) {
        const start = Math.max(honey.updatedAt, f.attachedAt);
        const end = f.attachedUntil;
        if (end <= start) continue;
        const rate = f.rate ?? 1;
        const remaining = HONEY_FULL_MS - accrued;
        const fillTime = remaining / rate;
        const windowMs = end - start;
        if (fillTime <= windowMs) {
          computed = start + fillTime;
          break;
        }
        accrued += windowMs * rate;
      }
      if (computed !== undefined) {
        readyAt = computed;
      } else {
        // No scheduled flower coverage is long enough to fill this hive —
        // without additional flowers being planted, it sits idle. Anchor at
        // now and signal that to the UI rather than implying a countdown.
        displayOverride = hive.flowers?.length ? "Waiting on flowers" : "Idle";
      }
    } else {
      displayOverride = "Idle";
    }

    timers.push({
      category: "Beehives",
      label: `Beehive ${idx + 1}`,
      // Show the stored amount in the sublabel rather than as a count prefix:
      // "0.45× Beehive 1" would read awkwardly (you can't have 0.45 of a hive).
      sublabel: `${formatYield(currentHoney)} honey · ${(fullness * 100).toFixed(0)}% full`,
      readyAt,
      displayOverride,
      key: `hive-${id}`,
    });
  });

  // Resources (trees + rock-shaped resources). We skip entries where the
  // resource has never been touched (minedAt/choppedAt === 0) — they're
  // always available, so showing them as "Ready" is just noise.
  for (const [id, tree] of Object.entries(state.trees ?? {})) {
    const choppedAt = tree.wood?.choppedAt;
    if (!choppedAt) continue;
    const readyAt = choppedAt + TREE_RECOVERY_SECONDS * 1000;
    // Variants (Tree / Ancient Tree / Sacred Tree) all collapse into a
    // single "Tree" card. Per-tree yield differs (tier 2 +0.5, tier 3 +2.5)
    // because predictTree passes the underlying `tree` to the game function;
    // aggregation sums those individual amounts.
    //
    // The game keeps a separate counter per tree variant, with the basic
    // tree's counter living under "Basic Tree Chopped" rather than "Tree
    // Chopped". Mirror that exactly so the prng rolls match what each plot
    // will get on actual harvest.
    const treeName = (tree as { name?: string }).name ?? "Tree";
    const activity =
      treeName === "Tree" ? "Basic Tree Chopped" : `${treeName} Chopped`;
    timers.push({
      category: "Resources",
      label: "Tree",
      readyAt,
      key: `tree-${id}`,
      predictedYield:
        predictTree(state, id, readyAt, farmId, nextCounter(activity)) ??
        undefined,
    });
  }

  const ROCK_RESOURCES: Array<{
    field: keyof Pick<
      GameState,
      "stones" | "iron" | "gold" | "crimstones" | "sunstones"
    >;
    /** Single base label for the resource — upgraded variants (Fused /
     * Reinforced / Refined / Tempered / Pure / Prime) all roll up here so
     * the user sees one card per resource type. The yield calculation
     * still uses each rock's individual `tier` and `multiplier`. */
    label: string;
    /** Default `rock.name` when the rock object hasn't set one — matches
     * the `rock.name ?? "<X> Rock"` fallback inside each game handler. */
    fallbackRockName: string;
    /**
     * Builds the farmActivity counter key for a single rock. Stones, iron,
     * and gold use a per-variant key (`${rock.name} Mined`) — see e.g.
     * stoneMine.ts line 396. Crimstone uses a single literal `"Crimstone
     * Mined"` regardless of `rock.name`. We mirror those conventions
     * exactly so the predictive sequence advances on the same key the
     * game will tick after each harvest.
     */
    activityFor: (rockName: string) => string;
    seconds: number;
  }> = [
    {
      field: "stones",
      label: "Stone",
      fallbackRockName: "Stone Rock",
      activityFor: (n) => `${n} Mined`,
      seconds: STONE_RECOVERY_SECONDS,
    },
    {
      field: "iron",
      label: "Iron",
      fallbackRockName: "Iron Rock",
      activityFor: (n) => `${n} Mined`,
      seconds: IRON_RECOVERY_SECONDS,
    },
    {
      field: "gold",
      label: "Gold",
      fallbackRockName: "Gold Rock",
      activityFor: (n) => `${n} Mined`,
      seconds: GOLD_RECOVERY_SECONDS,
    },
    {
      field: "crimstones",
      label: "Crimstone",
      fallbackRockName: "Crimstone Rock",
      // Crimstone is the odd one out — game stores under a single literal
      // key, not per-variant.
      activityFor: () => "Crimstone Mined",
      seconds: CRIMSTONE_RECOVERY_SECONDS,
    },
    {
      field: "sunstones",
      label: "Sunstone",
      fallbackRockName: "Sunstone Rock",
      // Sunstone has no chance bonuses; activity name is unused but we
      // provide one for symmetry / future-proofing.
      activityFor: () => "Sunstone Mined",
      seconds: SUNSTONE_RECOVERY_SECONDS,
    },
  ];
  const ROCK_PREDICTORS: Record<
    (typeof ROCK_RESOURCES)[number]["field"],
    (
      g: GameState,
      id: string,
      readyAt: number,
      farmId: number,
      counter: number,
    ) => number | null
  > = {
    stones: predictStone,
    iron: predictIron,
    gold: predictGold,
    crimstones: predictCrimstone,
    // Sunstone has no chance bonuses; takes the same signature for symmetry.
    sunstones: (g) => predictSunstone(g),
  };
  for (const {
    field,
    label,
    fallbackRockName,
    activityFor,
    seconds,
  } of ROCK_RESOURCES) {
    const rocks = (state[field] ?? {}) as Record<string, Rock>;
    for (const [id, rock] of Object.entries(rocks)) {
      const minedAt = rock.stone?.minedAt;
      if (!minedAt) continue;
      const readyAt = minedAt + seconds * 1000;
      const rockName = (rock as { name?: string }).name ?? fallbackRockName;
      timers.push({
        category: "Resources",
        label,
        readyAt,
        key: `${field}-${id}`,
        predictedYield:
          ROCK_PREDICTORS[field](
            state,
            id,
            readyAt,
            farmId,
            nextCounter(activityFor(rockName)),
          ) ?? undefined,
      });
    }
  }

  for (const [id, reserve] of Object.entries(state.oilReserves ?? {})) {
    const drilledAt = reserve.oil?.drilledAt;
    if (!drilledAt) continue;
    timers.push({
      category: "Resources",
      label: "Oil Reserve",
      readyAt: drilledAt + OIL_RESERVE_RECOVERY_SECONDS * 1000,
      key: `oil-${id}`,
      predictedYield: predictOil(state, id) ?? undefined,
    });
  }

  // Salt nodes accrue charges continuously on the server. The persisted
  // `salt.storedCharges` / `salt.nextChargeAt` fields go stale between
  // game-state mutations, so we let `predictSaltNode` re-run the game's
  // own `syncSaltNode` against `Date.now()`. Result: charge counts and
  // next-charge timers track real time, not the last server flush.
  const saltNodeIds = Object.keys(state.saltFarm?.nodes ?? {}).sort(
    // Numeric sort so "10" doesn't come before "2".
    (a, b) => Number(a) - Number(b),
  );
  // Per-rake salt yield is the same regardless of node — compute once.
  const saltPerRake = predictSaltPerRake(state);
  saltNodeIds.forEach((id, idx) => {
    const info = predictSaltNode(state, id);
    if (!info) return;
    const isFull = info.stored >= info.max;
    timers.push({
      category: "Salt Nodes",
      label: `Salt Node ${idx + 1}`,
      sublabel: `${info.stored}/${info.max} charges`,
      // For partial nodes the timer counts down to the next charge tick.
      // For full nodes we anchor at "now" so status renders as ready and
      // displayOverride pins the right-side text to "Ready".
      readyAt: isFull ? Date.now() : info.nextChargeAt,
      displayOverride: isFull ? "Ready" : undefined,
      // Treat the next-charge moment as a deadline so TimerCard prefixes
      // the countdown with "in" — matches the user's expected "next charge
      // in 5m 30s" framing.
      isDeadline: !isFull,
      key: `salt-${id}`,
      // Per-rake yield × stored charges = expected salt the player will
      // collect when they next rake this node.
      predictedYield:
        saltPerRake != null && info.stored > 0
          ? saltPerRake * info.stored
          : undefined,
    });
  });

  // Mushrooms — both kinds spawn on a 16h cycle.
  if (state.mushrooms?.spawnedAt) {
    timers.push({
      category: "Mushrooms",
      label: "Wild Mushroom",
      readyAt: state.mushrooms.spawnedAt + MUSHROOM_SPAWN_SECONDS * 1000,
      key: "mushroom-wild",
      predictedYield: predictMushroom(),
    });
  }
  if (state.mushrooms?.magicSpawnedAt) {
    timers.push({
      category: "Mushrooms",
      label: "Magic Mushroom",
      readyAt: state.mushrooms.magicSpawnedAt + MUSHROOM_SPAWN_SECONDS * 1000,
      key: "mushroom-magic",
      predictedYield: predictMushroom(),
    });
  }

  // Aging Shed — fermentation, aging rack (cheese / fish), spice rack.
  // Each rack entry already carries its own readyAt.
  const racks = state.agingShed?.racks;
  // All aging-shed jobs share the same Ager-doubled base yield.
  const agingYield = predictAgingShed(state) ?? undefined;
  for (const job of racks?.fermentation ?? []) {
    if (!job.readyAt) continue;
    timers.push({
      category: "Aging Shed",
      label: job.recipe ?? "Fermentation",
      readyAt: job.readyAt,
      key: `ferment-${job.id}`,
      predictedYield: agingYield,
    });
  }
  for (const job of racks?.aging ?? []) {
    if (!job.readyAt) continue;
    timers.push({
      category: "Aging Shed",
      label: job.recipe ?? job.fish ?? "Aging",
      readyAt: job.readyAt,
      key: `aging-${job.id}`,
      predictedYield: agingYield,
    });
  }
  for (const job of racks?.spice ?? []) {
    if (!job.readyAt) continue;
    timers.push({
      category: "Aging Shed",
      label: job.recipe ?? "Spice",
      readyAt: job.readyAt,
      key: `spice-${job.id}`,
      predictedYield: agingYield,
    });
  }

  // Crafting Box — every queued slot gets its own card with the output
  // and ETA. Slots that share an output (e.g. crafting two of the same
  // collectible) stay on separate cards via aggregationKey, same approach
  // as Crop Machine. Falls back to the legacy top-level readyAt only when
  // the queue is empty.
  const cbQueue = state.craftingBox?.queue ?? [];
  cbQueue.forEach((item, idx) => {
    if (!item?.readyAt) return;
    // Each queue entry is `{ id, readyAt, startedAt, type, name }` per the
    // game's CraftingQueueItem type; `name` is the collectible/wearable
    // being crafted in that slot. (See features/game/types/game.ts in the
    // merged subtree.) Older save shapes used `collectible`/`wearable`
    // fields, which we still tolerate as a fallback.
    const it = item as {
      type?: string;
      name?: string;
      collectible?: string | { collectible?: string; wearable?: string };
      wearable?: string;
    };
    const legacyCollectible =
      typeof it.collectible === "object"
        ? (it.collectible?.collectible ?? it.collectible?.wearable)
        : it.collectible;
    const outputName =
      it.name ?? legacyCollectible ?? it.wearable ?? "Crafting";
    timers.push({
      category: "Crafting",
      label: outputName,
      sublabel: `Slot ${idx + 1}`,
      readyAt: item.readyAt,
      key: `craft-${idx}`,
      aggregationKey: `crafting|${idx}`,
    });
  });
  if (cbQueue.length === 0 && state.craftingBox?.readyAt) {
    timers.push({
      category: "Crafting",
      label: "Crafting",
      readyAt: state.craftingBox.readyAt,
      key: "craft-legacy",
    });
  }

  // Crop Machine — each placed machine has a queue of growth packs. A pack
  // only has a firm ETA once oil has been allocated to cover the remaining
  // grow time (readyAt). When the machine runs out of oil mid-pack, the
  // pack pauses at growsUntil; we surface that as a deadline (the moment
  // growth stops) so the player knows when to top up oil.
  (state.buildings?.["Crop Machine"] ?? []).forEach((machine, mIdx) => {
    const machineId = machine.id ?? `idx${mIdx}`;
    (machine.queue ?? []).forEach((pack, qIdx) => {
      const readyAt = pack.readyAt ?? pack.growsUntil ?? Date.now();
      // The pack consumes `pack.seeds` slots of the activity counter — pull
      // a single starting counter and let the predictor advance it per seed.
      const seeds = (pack as { seeds?: number }).seeds ?? 1;
      let startCounter = farmActivity[`${pack.crop} Harvested`] ?? 0;
      const seq = sequenceCounters.get(`${pack.crop} Harvested`) ?? 0;
      startCounter += seq;
      sequenceCounters.set(`${pack.crop} Harvested`, seq + seeds);
      const packYield =
        predictCropMachinePack(
          state,
          machineId,
          qIdx,
          readyAt,
          farmId,
          startCounter,
        ) ?? undefined;
      // Each pack gets its own aggregation bucket via aggregationKey, so
      // multiple packs growing the same crop stay on separate cards with
      // their individual ready times instead of collapsing into "N× Soybean".
      const aggregationKey = `cropmachine|${machineId}|${qIdx}`;
      if (pack.readyAt) {
        timers.push({
          category: "Crop Machine",
          label: pack.crop,
          sublabel: pack.seeds ? `${pack.seeds} seeds` : undefined,
          readyAt: pack.readyAt,
          key: `cropmachine-${machineId}-${qIdx}`,
          predictedYield: packYield,
          aggregationKey,
        });
      } else if (pack.growsUntil) {
        timers.push({
          category: "Crop Machine",
          label: pack.crop,
          sublabel: pack.seeds ? `${pack.seeds} seeds · oil out` : "oil out",
          readyAt: pack.growsUntil,
          isDeadline: true,
          key: `cropmachine-${machineId}-${qIdx}`,
          predictedYield: packYield,
          aggregationKey,
        });
      }
    });
  });

  // Lava pits — only show when actively running (startedAt set, not yet
  // collected). Idle/uninitialised pits don't have a meaningful timer.
  // Lava pit yield (Obsidian) is farm-wide — same for every active pit.
  const obsidianYield = predictLavaPit(state) ?? undefined;
  for (const [id, pit] of Object.entries(state.lavaPits ?? {})) {
    if (!pit.startedAt || !pit.readyAt) continue;
    if (pit.collectedAt && pit.collectedAt >= pit.startedAt) continue;
    timers.push({
      category: "Lava Pits",
      label: "Lava Pit",
      readyAt: pit.readyAt,
      key: `lava-${id}`,
      predictedYield: obsidianYield,
    });
  }

  // Crab traps (water traps placed on beach plots). The crustacean a trap
  // will yield is locked in at placement, stored on `waterTrap.caught` —
  // surface that as the label so the player sees the output, not the pot.
  for (const [id, spot] of Object.entries(state.crabTraps?.trapSpots ?? {})) {
    const trap = spot.waterTrap;
    if (!trap?.readyAt) continue;
    const caughtName = Object.keys(trap.caught ?? {})[0];
    timers.push({
      category: "Crab Traps",
      label: caughtName ?? trap.type,
      readyAt: trap.readyAt,
      key: `trap-${id}`,
      predictedYield: predictCrabTrap(state, id) ?? undefined,
    });
  }

  // Daily rewards chest — resets at 00:00 UTC each day, not 24h after the
  // last collection. We compute the start of the UTC day *after* the one
  // the chest was last collected on.
  const collectedAt = state.dailyRewards?.chest?.collectedAt;
  if (collectedAt) {
    const collected = new Date(collectedAt);
    const nextResetAt = Date.UTC(
      collected.getUTCFullYear(),
      collected.getUTCMonth(),
      collected.getUTCDate() + 1,
    );
    timers.push({
      category: "Daily Rewards",
      label: "Daily Chest",
      readyAt: nextResetAt,
      key: "daily-chest",
    });
  }

  // Bounties — board requests with expiresAt
  for (const req of state.bounties?.requests ?? []) {
    if (!req.expiresAt) continue;
    timers.push({
      category: "Bounties",
      label: req.name ?? "Bounty",
      sublabel: `Expires`,
      readyAt: req.expiresAt,
      isDeadline: true,
      key: `bounty-${req.id}`,
    });
  }

  timers.sort((a, b) => a.readyAt - b.readyAt);
  return timers;
}

export type AggregatedTimer = {
  category: TimerCategory;
  label: string;
  count: number;
  /** When the next item in the group is ready. */
  earliestReadyAt: number;
  /** When the last item in the group is ready (== earliest when count == 1). */
  latestReadyAt: number;
  /** Unique non-empty sublabels from the underlying timers — used by Cooking
   * to surface which building(s) the recipe is queued in. */
  sublabels: string[];
  /** Static text that overrides the countdown display (e.g. "Charges Full"). */
  displayOverride?: string;
  isDeadline?: boolean;
  key: string;
  /** Sum of predictedYield across the underlying timers. Undefined when no
   * underlying timer carried a prediction (e.g. cooking, bounties). */
  totalPredictedYield?: number;
};

/**
 * Roll up timers that share the same (category, label) — e.g. all Sunflowers,
 * or all Chickens — into a single entry with count + min/max ready times.
 * Different labels stay separate, so a board of mixed bounties or a kitchen
 * cooking three different recipes still shows one row per recipe.
 */
export function aggregateTimers(timers: Timer[]): AggregatedTimer[] {
  const groups = new Map<string, AggregatedTimer>();
  for (const t of timers) {
    // "Output: Input" labels aggregate by their output — e.g. every
    // "Greenhouse Goodie: Pickled X" variant merges into a single row,
    // the same way 12 sunflowers collapse into one. The input slides
    // into the sublabel slot for any UI that wants to surface it.
    const colonIdx = t.label.indexOf(": ");
    const label = colonIdx > 0 ? t.label.slice(0, colonIdx) : t.label;
    const inputSublabel =
      colonIdx > 0 ? t.label.slice(colonIdx + 2) : undefined;
    const sublabel = t.sublabel ?? inputSublabel;

    const key = t.aggregationKey ?? `${t.category}|${label}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        category: t.category,
        label,
        count: 1,
        earliestReadyAt: t.readyAt,
        latestReadyAt: t.readyAt,
        sublabels: sublabel ? [sublabel] : [],
        displayOverride: t.displayOverride,
        isDeadline: t.isDeadline,
        key,
        totalPredictedYield: t.predictedYield,
      });
    } else {
      existing.count++;
      existing.earliestReadyAt = Math.min(existing.earliestReadyAt, t.readyAt);
      existing.latestReadyAt = Math.max(existing.latestReadyAt, t.readyAt);
      if (sublabel && !existing.sublabels.includes(sublabel)) {
        existing.sublabels.push(sublabel);
      }
      if (t.predictedYield != null) {
        existing.totalPredictedYield =
          (existing.totalPredictedYield ?? 0) + t.predictedYield;
      }
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.earliestReadyAt - b.earliestReadyAt,
  );
}

/**
 * Display order for timer sections. Returned object iteration follows
 * insertion order (ES2015+), so listing categories here is what controls
 * the order they appear in the dashboard and sidebar. Any category that
 * shows up at runtime but isn't in this list falls to the end.
 */
const CATEGORY_ORDER: TimerCategory[] = [
  "Daily Rewards",
  "Crops",
  "Fruit Patches",
  "Greenhouse",
  "Crop Machine",
  "Resources",
  "Salt Nodes",
  "Lava Pits",
  "Cooking",
  "Animals",
  "Flowers",
  "Beehives",
  "Mushrooms",
  "Crab Traps",
  "Aging Shed",
  "Composters",
  "Crafting",
];

/**
 * Categories the player has infrastructure for, even if no timers are running
 * right now. Used so that e.g. an empty Crops section still renders ("No
 * crops planted") instead of disappearing entirely when every plot is bare.
 *
 * The rule throughout: a category is "active" when the corresponding subtree
 * of state exists with at least one entry. Categories tied to game-wide
 * features (Daily Rewards, Bounties, Mushrooms, Aging Shed, Crafting) are
 * keyed off the presence of their root object instead.
 */
export function extractActiveCategories(
  state: GameState | undefined,
): Set<TimerCategory> {
  const active = new Set<TimerCategory>();
  if (!state) return active;

  if (Object.keys(state.crops ?? {}).length > 0) active.add("Crops");
  if (Object.keys(state.fruitPatches ?? {}).length > 0)
    active.add("Fruit Patches");
  if (Object.keys(state.greenhouse?.pots ?? {}).length > 0)
    active.add("Greenhouse");
  if (Object.keys(state.flowers?.flowerBeds ?? {}).length > 0)
    active.add("Flowers");
  if (Object.keys(state.beehives ?? {}).length > 0) active.add("Beehives");

  const COOKING_BUILDINGS = [
    "Fire Pit",
    "Kitchen",
    "Bakery",
    "Deli",
    "Smoothie Shack",
  ];
  if (COOKING_BUILDINGS.some((n) => (state.buildings?.[n]?.length ?? 0) > 0))
    active.add("Cooking");

  const COMPOSTERS = ["Compost Bin", "Turbo Composter", "Premium Composter"];
  if (COMPOSTERS.some((n) => (state.buildings?.[n]?.length ?? 0) > 0))
    active.add("Composters");

  if ((state.buildings?.["Crop Machine"]?.length ?? 0) > 0)
    active.add("Crop Machine");

  if (
    Object.keys(state.henHouse?.animals ?? {}).length > 0 ||
    Object.keys(state.barn?.animals ?? {}).length > 0
  )
    active.add("Animals");

  if (
    Object.keys(state.trees ?? {}).length > 0 ||
    Object.keys(state.stones ?? {}).length > 0 ||
    Object.keys(state.iron ?? {}).length > 0 ||
    Object.keys(state.gold ?? {}).length > 0 ||
    Object.keys(state.crimstones ?? {}).length > 0 ||
    Object.keys(state.sunstones ?? {}).length > 0 ||
    Object.keys(state.oilReserves ?? {}).length > 0
  )
    active.add("Resources");

  if (Object.keys(state.saltFarm?.nodes ?? {}).length > 0)
    active.add("Salt Nodes");
  if (Object.keys(state.crabTraps?.trapSpots ?? {}).length > 0)
    active.add("Crab Traps");
  if (Object.keys(state.lavaPits ?? {}).length > 0) active.add("Lava Pits");

  if (state.mushrooms) active.add("Mushrooms");
  if (state.agingShed) active.add("Aging Shed");
  if (state.craftingBox) active.add("Crafting");
  if (state.dailyRewards) active.add("Daily Rewards");
  if (state.bounties) active.add("Bounties");

  return active;
}

export function groupByCategory(
  timers: AggregatedTimer[],
  activeCategories: ReadonlySet<TimerCategory> = new Set(),
): Record<string, AggregatedTimer[]> {
  const buckets = new Map<TimerCategory, AggregatedTimer[]>();
  for (const t of timers) {
    const list = buckets.get(t.category);
    if (list) list.push(t);
    else buckets.set(t.category, [t]);
  }

  // Salt nodes and beehives are individually keyed ("Salt Node 1" …,
  // "Beehive 1" …) so each lands in its own aggregation bucket. The default
  // earliest-ready ordering interleaves them by ready time, which makes the
  // list look randomly shuffled. Re-sort numerically by the label's trailing
  // digit so they read 1, 2, 3, …
  const sortByTrailingNumber = (list: AggregatedTimer[]) => {
    list.sort((a, b) => {
      const ai = parseInt(a.label.match(/(\d+)$/)?.[1] ?? "0", 10);
      const bi = parseInt(b.label.match(/(\d+)$/)?.[1] ?? "0", 10);
      return ai - bi;
    });
  };
  const saltNodes = buckets.get("Salt Nodes");
  if (saltNodes) sortByTrailingNumber(saltNodes);
  const beehives = buckets.get("Beehives");
  if (beehives) sortByTrailingNumber(beehives);

  const out: Record<string, AggregatedTimer[]> = {};
  for (const cat of CATEGORY_ORDER) {
    const list = buckets.get(cat);
    if (list) out[cat] = list;
    else if (activeCategories.has(cat)) out[cat] = [];
  }
  // Anything not in CATEGORY_ORDER (e.g. a new category added before this
  // list is updated) falls through to the end so it still renders.
  for (const [cat, list] of buckets) {
    if (!(cat in out)) out[cat] = list;
  }
  // Mirror that fall-through for active-but-idle categories not in the order
  // list — without this, a category that exists in the type but isn't ordered
  // (e.g. Crafting, Lava Pits) would be dropped when its timers are empty.
  for (const cat of activeCategories) {
    if (!(cat in out)) out[cat] = [];
  }
  return out;
}
