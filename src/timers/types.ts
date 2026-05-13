export type Category =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Crop Machine"
  | "Flowers"
  | "Beehives"
  | "Animals"
  | "Resources"
  | "Salt"
  | "Lava Pits";

export const CATEGORY_ORDER: Category[] = [
  "Crops",
  "Fruit Patches",
  "Greenhouse",
  "Crop Machine",
  "Flowers",
  "Beehives",
  "Animals",
  "Resources",
  "Salt",
  "Lava Pits",
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

export type Timer = {
  id: string;
  category: Category;
  label: string;
  icon?: string;
  readyAt: number;
  predictedYield?: { amount: number; item: string };
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
