import type { AggregatedTimer, Timer } from "./types.ts";

// Group timers by `aggregationKey` (or `${category}|${label}` when absent).
// Each group becomes one AggregatedTimer:
//   - `count` = number of merged source timers
//   - `predictedYield.amount` = sum of source yields (assumes same item)
//   - `readyAt` = minimum readyAt (the next thing to come ready)
// Order within the input is preserved for the first-seen entry per group.

export function aggregateTimers(timers: Timer[]): AggregatedTimer[] {
  const groups = new Map<string, AggregatedTimer>();

  for (const t of timers) {
    const key = t.aggregationKey ?? `${t.category}|${t.label}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...t,
        count: 1,
        predictedYield: t.predictedYield ? { ...t.predictedYield } : undefined,
      });
      continue;
    }

    existing.count += 1;
    existing.readyAt = Math.min(existing.readyAt, t.readyAt);

    if (t.predictedYield) {
      if (existing.predictedYield) {
        existing.predictedYield = {
          item: existing.predictedYield.item,
          amount: existing.predictedYield.amount + t.predictedYield.amount,
        };
      } else {
        existing.predictedYield = { ...t.predictedYield };
      }
    }
  }

  return [...groups.values()];
}
