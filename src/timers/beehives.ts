import {
  DEFAULT_HONEY_PRODUCTION_TIME,
  getCurrentHoneyProduced,
  getCurrentSpeed,
  getHoneyMultiplier,
  getItemIcon,
  refreshBeehives,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { NODE_LABEL } from "./resources.ts";
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
    const isFull = produced >= DEFAULT_HONEY_PRODUCTION_TIME;
    const speed = isFull ? 0 : getCurrentSpeed(hive, ctx.now);
    // Paused = no flower currently feeding the hive AND not yet full.
    // Mirrors upstream `beehive.honeyProductionPaused` (Beehive.tsx
    // `currentSpeed === 0` branch). We still emit a Timer so the card
    // stays visible — otherwise a player with only paused hives sees
    // "No active beehives" and can't tell which hives need flowers.
    const isPaused = !isFull && speed <= 0;

    const readyAt =
      isFull || isPaused
        ? ctx.now
        : ctx.now + (DEFAULT_HONEY_PRODUCTION_TIME - produced) / speed;

    // Current honey at this moment: fraction-of-full × multiplier. When
    // the hive is full, fraction = 1 and amount = multiplier. While
    // producing, amount tracks what's currently sitting in the hive.
    // (sunflower-land/src/features/game/events/landExpansion/harvestBeehive.ts:
    // `getTotalHoneyProduced` returns `honeyProduced * multiplier` where
    // honeyProduced is `produced / DEFAULT_HONEY_PRODUCTION_TIME`.)
    const fraction = Math.min(produced / DEFAULT_HONEY_PRODUCTION_TIME, 1);
    const amount = fraction * multiplier;

    // `hive.swarm` is set server-side (see api `swarmGenerator`) and
    // synced down on the next state pull. When true, the upcoming
    // beehive harvest applies the swarm bonus and resets the flag
    // (harvestBeehive.ts:143-148). Surface it as a chip so the player
    // sees a pending swarm before they collect.
    const bonus = hive.swarm
      ? {
          icon: CHROME_ICONS.bee,
          label: "Swarm",
          type: "success" as const,
        }
      : undefined;

    out.push({
      id: `beehive:${hiveId}`,
      category: "Beehives",
      label: "Honey",
      icon: getItemIcon("Honey"),
      readyAt,
      predictedYield: { amount, item: "Honey" },
      progressPercent: fraction * 100,
      ...(bonus && { bonus }),
      ...(isPaused && {
        idle: true,
        idleText: "Paused",
        idleLabelType: "danger" as const,
      }),
      // Notifications go through the worker's ready digest, not a per-hive
      // alarm: a full hive stamps `readyAt = now`, which churns the alarm
      // fire key every sweep (re-firing "Honey ready" every ~10 min), and
      // each hive carries its own key so they'd fan out to one push each.
      // `ready` = full (collectable now); the digest groups all full hives
      // into one "N hives ready" push and dedups until collected. Paused /
      // mid-production hives report `ready: false`, so they clear any
      // prior dedup and re-notify once they fill.
      notifyDigest: { ready: isFull, group: "Beehives", noun: "hive" },
      // Unique per hive — each beehive shows as its own card.
      aggregationKey: `Beehives|${hiveId}`,
      nodeLabel: NODE_LABEL.Honey,
    });
  }

  return out;
}
