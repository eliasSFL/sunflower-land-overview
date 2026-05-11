export type Category =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Crop Machine"
  | "Flowers"
  | "Beehives"
  | "Resources";

export const CATEGORY_ORDER: Category[] = [
  "Crops",
  "Fruit Patches",
  "Greenhouse",
  "Crop Machine",
  "Flowers",
  "Beehives",
  "Resources",
];

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
  metadata?: Record<string, string>;
};

export type AggregatedTimer = Timer & {
  count: number;
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
