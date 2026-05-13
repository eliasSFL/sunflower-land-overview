import {
  DEFAULT_HONEY_PRODUCTION_TIME,
  getCurrentHoneyProduced,
  getCurrentSpeed,
  getHoneyMultiplier,
  getItemIcon,
  refreshBeehives,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per beehive — beehives don't aggregate well (each progresses
// at its own rate based on which flowers it caught).
//
// The saved state we get from the API has stale `hive.flowers[]` (last-
// saved attachments, often all expired by now). The in-game UI runs
// `updateBeehives` on every render to bake elapsed honey into
// `honey.produced`, drop expired flowers, and re-attach flowers from
// currently-growing flower beds. We do the same here before reading any
// per-hive value, then use the same naive `now + (DEFAULT - produced)/
// speed` formula the in-game Beehive component shows. See
// sunflower-land/src/features/game/expansion/components/resources/
// beehive/Beehive.tsx:secondsLeftUntilFull.
//
// Active-hive check mirrors upstream `getActiveBeehives` in
// sunflower-land/src/features/game/lib/updateBeehives.ts:116 — a hive is
// active if at least one coordinate is set. `removedAt` is NOT a
// reliable signal: re-placed hives can still carry a stale `removedAt`
// from a prior landscaping event.

export function extractBeehiveTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  if (!state.beehives || Object.keys(state.beehives).length === 0) {
    return [];
  }

  // Refresh once so subsequent reads see freshly-attached flowers.
  // `getCurrentHoneyProduced` / `getCurrentSpeed` accept an explicit
  // `now` — we pass `ctx.now` (the value from useNow) so render output
  // stays stable across the second.
  const refreshed = refreshBeehives({ game: state, createdAt: ctx.now });

  const multiplier = getHoneyMultiplier(state);
  const out: Timer[] = [];

  for (const [hiveId, hive] of Object.entries(refreshed)) {
    // Active = at least one coordinate set. Hives landscaped away have
    // both x and y stripped.
    if (hive.x === undefined && hive.y === undefined) continue;

    const produced = getCurrentHoneyProduced(hive, ctx.now);
    let readyAt: number;

    if (produced >= DEFAULT_HONEY_PRODUCTION_TIME) {
      readyAt = ctx.now;
    } else {
      const speed = getCurrentSpeed(hive, ctx.now);
      if (speed <= 0) {
        // No flower currently producing AND not full yet → skip; the
        // in-game UI also shows no countdown in this state.
        continue;
      }
      readyAt = ctx.now + (DEFAULT_HONEY_PRODUCTION_TIME - produced) / speed;
    }

    // Current honey at this moment: fraction-of-full × multiplier. When
    // the hive is full, fraction = 1 and amount = multiplier. While
    // producing, amount tracks what's currently sitting in the hive.
    // (sunflower-land/src/features/game/events/landExpansion/harvestBeehive.ts:
    // `getTotalHoneyProduced` returns `honeyProduced * multiplier` where
    // honeyProduced is `produced / DEFAULT_HONEY_PRODUCTION_TIME`.)
    const fraction = Math.min(produced / DEFAULT_HONEY_PRODUCTION_TIME, 1);
    const amount = fraction * multiplier;

    out.push({
      id: `beehive:${hiveId}`,
      category: "Beehives",
      label: "Honey",
      icon: getItemIcon("Honey"),
      readyAt,
      predictedYield: { amount, item: "Honey" },
      progressPercent: fraction * 100,
      // Unique per hive — each beehive shows as its own card.
      aggregationKey: `Beehives|${hiveId}`,
    });
  }

  return out;
}
