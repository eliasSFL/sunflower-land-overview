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
// BoostName from the submodule; `value` is the formatted contribution
// (e.g. "+0.2", "x1.2"). We keep this as plain strings so callers don't
// need to import BoostName. `icon` is resolved at extraction time via
// the same upstream helper BoostsDisplay uses; empty string when the
// resolver returns nothing (rare — usually the lightning fallback).
// `label` is the display string (startCased / translated upstream).
// `weight` is the per-node multiplier (innate Tree/Rock `multiplier` —
// ancient trees, upgraded rocks, etc.); absent ≡ 1. The aggregator
// sums weights into the `count` shown on the right of each row.
export type Boost = {
  name: string;
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
  item: string;
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
  predictedYield?: { amount: number; item: string };
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
  metadata?: Record<string, string>;
};

export type AggregatedTimer = Omit<Timer, "boosts"> & {
  count: number;
  boosts?: AggregatedBoost[];
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
