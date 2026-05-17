import type {
  AggregatedBoost,
  AggregatedTimer,
  Boost,
  Timer,
} from "./types.ts";

// Group timers by `aggregationKey` (or `${category}|${label}` when absent).
// Each group becomes one AggregatedTimer:
//   - `count` = number of merged source timers
//   - `predictedYield.amount` = sum of source yields (assumes same item)
//   - `readyAt` = minimum readyAt (the next thing to come ready)
//   - `boosts` = deduped union across plots; each entry counts the
//     plots it fired on. AOE-gated boosts (Scary Mike) tend to fire on
//     one plot only — count: 1. Flat-rate boosts (Scarecrow, Kuebiko)
//     match every plot — count: <total plots>.
// Order within the input is preserved for the first-seen entry per group.

// Merge a per-plot boost list into the running tally for an aggregated
// timer. Same name+value pair adds `weight ?? 1` to the count; otherwise
// pushed. `weight` captures the source node's innate multiplier (Tree/
// Rock `multiplier`) so an ancient tree (mult=16) firing one Foreman
// Beaver shows as "x1.2 ×16" rather than "x1.2 ×1".
function mergeBoosts(
  tally: AggregatedBoost[],
  incoming: Boost[] | undefined,
): AggregatedBoost[] {
  if (!incoming || incoming.length === 0) return tally;
  for (const b of incoming) {
    const w = b.weight ?? 1;
    const existing = tally.find(
      (t) => t.name === b.name && t.value === b.value,
    );
    if (existing) {
      existing.count += w;
    } else {
      tally.push({
        name: b.name,
        value: b.value,
        icon: b.icon,
        label: b.label,
        count: w,
      });
    }
  }
  return tally;
}

export function aggregateTimers(timers: Timer[]): AggregatedTimer[] {
  const groups = new Map<string, AggregatedTimer>();
  // Per-group readyAts collected separately so we don't grow the
  // AggregatedTimer's `instances` array until we know the group ended
  // up with count > 1 (single-source groups leave the field undefined
  // — see types.ts).
  const readyAtsByKey = new Map<string, number[]>();

  for (const t of timers) {
    const key = t.aggregationKey ?? `${t.category}|${t.label}`;
    const existing = groups.get(key);

    if (!existing) {
      // Strip the per-plot `boosts` field — the aggregate is a new
      // AggregatedBoost[] tally seeded from the first plot.
      const { boosts: _seed, ...rest } = t;
      groups.set(key, {
        ...rest,
        count: 1,
        predictedYield: t.predictedYield ? { ...t.predictedYield } : undefined,
        boosts: mergeBoosts([], t.boosts),
      });
      readyAtsByKey.set(key, [t.readyAt]);
      continue;
    }

    existing.count += 1;
    existing.readyAt = Math.min(existing.readyAt, t.readyAt);
    readyAtsByKey.get(key)!.push(t.readyAt);

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

    existing.boosts = mergeBoosts(existing.boosts ?? [], t.boosts);
  }

  for (const [key, t] of groups) {
    // Drop empty boost arrays so card rendering can simply check truthiness.
    if (t.boosts && t.boosts.length === 0) t.boosts = undefined;
    // Attach per-instance readyAts for the DO scheduler (Bug 2 fix —
    // lets the notification path schedule per-ripening-wave instead
    // of one alarm at min(readyAt) per aggregation key). Single-
    // source groups don't need it; the scheduler falls back to
    // `readyAt`/`count` for those.
    if (t.count > 1) {
      const readyAts = readyAtsByKey.get(key)!;
      readyAts.sort((a, b) => a - b);
      t.instances = readyAts;
    }
  }

  return [...groups.values()];
}
