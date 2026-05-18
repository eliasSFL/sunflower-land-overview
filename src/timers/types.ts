import type {
  BoostName,
  BumpkinItem,
  InventoryItemName,
} from "../game/index.ts";

// The `item` displayed on a TimerCard / TimerSlot row. Every extractor
// resolves it to an InventoryItemName (crops, recipes, resources,
// composted outputs, ...) or a BumpkinItem (Crafting Box wearables) —
// with one intentional exception. Salt nodes display "N Salt Charged"
// in the headline to convey that the stored count needs raking; the
// per-rake "Salt" name would lose that meaning. Threading the literal
// through the union keeps the type honest without forcing a UX change.
export type TimerItemName = InventoryItemName | BumpkinItem | "Salt Charged";

export type Category =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Crop Machine"
  | "Flowers"
  | "Beehives"
  | "Resources"
  | "Salt"
  | "Animals"
  | "Fire Pit"
  | "Smoothie Shack"
  | "Deli"
  | "Kitchen"
  | "Bakery"
  | "Fish Market"
  | "Composters"
  | "Aging Rack"
  | "Fermentation Rack"
  | "Spice Rack"
  | "Crafting Box";

// Each cooking / processing building is its own top-level category so
// the layout flows them as independent panels and MobileNav gets a chip
// per building. Order within the cooking cluster mirrors the upstream
// COOKING_BUILDINGS array (Fire Pit → … → Kitchen), with Fish Market
// appended since it's a processing building rather than cooking proper.
export const COOKING_BUILDING_CATEGORIES: readonly Category[] = [
  "Fire Pit",
  "Bakery",
  "Deli",
  "Smoothie Shack",
  "Kitchen",
  "Fish Market",
];

// The Aging Shed building contains three independent racks. Each rack
// is its own category so it flows as its own panel + MobileNav chip,
// matching how cooking buildings are split.
export const AGING_RACK_CATEGORIES: readonly Category[] = [
  "Aging Rack",
  "Fermentation Rack",
  "Spice Rack",
];

// Categories that should only render when the underlying building is
// actually placed — used by App.tsx to filter `visibleCategories` so
// players don't see chips / panels for buildings they don't own.
export const PLACEMENT_GATED_CATEGORIES: readonly Category[] = [
  ...COOKING_BUILDING_CATEGORIES,
  ...AGING_RACK_CATEGORIES,
];

export const CATEGORY_ORDER: Category[] = [
  "Crops",
  "Fruit Patches",
  "Greenhouse",
  "Crop Machine",
  "Flowers",
  "Beehives",
  "Resources",
  "Salt",
  "Animals",
  ...COOKING_BUILDING_CATEGORIES,
  "Composters",
  ...AGING_RACK_CATEGORIES,
  "Crafting Box",
];

// One boost as returned by upstream yield functions. `name` is a
// BoostName from the submodule (collectible / wearable / skill / bud /
// seasonal-event); `value` is the formatted contribution (e.g. "+0.2",
// "x1.2"). `icon` is resolved at extraction time via the same upstream
// helper BoostsDisplay uses; empty string when the resolver returns
// nothing (rare — usually the lightning fallback). `label` is the
// display string (startCased / translated upstream). `weight` is the
// per-node multiplier (innate Tree/Rock `multiplier` — ancient trees,
// upgraded rocks, etc.); absent ≡ 1. The aggregator sums weights into
// the `count` shown on the right of each row.
export type Boost = {
  name: BoostName;
  value: string;
  icon?: string;
  label?: string;
  weight?: number;
};

// Aggregated boost: same name+value seen on `count` plots in the merged
// group. AOE-gated boosts (Scary Mike, Sir Goldensnout) typically have
// count: 1; flat-rate boosts (Scarecrow, Kuebiko) match every plot.
export type AggregatedBoost = Boost & { count: number };

// Per-slot row inside a multi-slot card (e.g. cooking buildings). Each
// slot has its own item / amount / readyAt rendered as a list inside
// the card; the card-level readyAt is the earliest slot. `boosts`,
// when present, lets the row render its own collapsible boost list
// — TimerCard mirrors the chevron pattern it uses for card-level
// boosts.
export type TimerSlot = {
  item: TimerItemName;
  icon?: string;
  amount: number;
  readyAt: number;
  boosts?: Boost[];
};

export type Timer = {
  id: string;
  category: Category;
  label: string;
  icon?: string;
  readyAt: number;
  predictedYield?: { amount: number; item: TimerItemName };
  // When present, the card renders the slot list (one row per slot)
  // instead of a single yield headline. Used by cooking buildings where
  // one building card holds multiple queued recipes.
  slots?: TimerSlot[];
  // The source exists but isn't producing right now (e.g. a placed
  // Kitchen with an empty queue). TimerCard hides the countdown label
  // and shows `idleText` instead; TimerSection sorts idle cards to the
  // bottom of the section regardless of `readyAt`.
  idle?: boolean;
  idleText?: string;
  // 0-100. When set, the card's headline appends "· N%". Useful for
  // sources that produce continuously (e.g. beehives) where the yield
  // amount tracks fraction-of-full and the percentage is the more
  // intuitive progress indicator.
  progressPercent?: number;
  // When set, downstream aggregation merges every Timer sharing this key
  // into one card. Yields are summed; readyAt becomes the earliest of the
  // group; count tracks the number of merged plots.
  aggregationKey?: string;
  // Boosts that contributed to predictedYield.amount. Surfaced in the
  // TimerCard tooltip so players can see WHY a yield is what it is.
  // Sourced from the upstream `boostsUsed` arrays — see
  // sunflower-land/src/features/game/events/landExpansion/harvest.ts.
  boosts?: Boost[];
  // Small text rendered under the headline. Useful for state that
  // doesn't fit "<amount> <item>" — e.g. salt charges "2/3 charges".
  subtext?: string;
  // Name of the source NODE (Tree, Chicken, Lava Pit, …) when distinct
  // from `label` (which usually names the produced item — Wood, Egg,
  // Obsidian, …). The notification scheduler uses this to render
  // "{amount} {item} from {N}× {nodeLabel}" so push bodies don't
  // suggest the player gets `{N}×{amount}` of the item. Extractors
  // where the node and the item share a name (a Sunflower plot
  // produces Sunflower) leave it undefined; the body falls back to
  // an "(×N)" suffix instead.
  nodeLabel?: string;
  metadata?: Record<string, string>;
};

export type AggregatedTimer = Omit<Timer, "boosts"> & {
  count: number;
  boosts?: AggregatedBoost[];
  // Per-source `{readyAt, amount}` pairs for every Timer merged into
  // this aggregate, sorted by readyAt ascending. Populated only when
  // count > 1; the notification scheduler reads it to cluster
  // ripening events into separate pushes (so e.g. zucchini ready at
  // T and T+1h fire as two notifications rather than one) AND to
  // surface the per-cluster yield in the body. `amount` is the
  // source Timer's `predictedYield.amount`, or 0 when the source has
  // no `predictedYield`. UI consumers ignore this field — they still
  // read `count` and `readyAt` (= the earliest).
  instances?: Array<{ readyAt: number; amount: number }>;
};

export type TimerContext = {
  farmId: number;
  now: number;
  // Closure created once per extraction pass. Each predictor calls
  // `next()` once per item so PRNG seeds advance — without this, a row of
  // identical crops would all roll the same chance-based bonuses.
  counter: { next: () => number };
};

export type Status = "ready" | "soon" | "later";

export function statusOf(readyAt: number, now: number): Status {
  if (readyAt <= now) return "ready";
  if (readyAt - now <= 60 * 60 * 1000) return "soon";
  return "later";
}
