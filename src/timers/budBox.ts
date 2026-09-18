import { getDailyBudBoxType, type GameState } from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import type { Timer, TimerContext } from "./types.ts";

// The Plaza's Bud Box (#7588): a chest by the plaza that pays out once a
// UTC day — but only to a player holding a Bud of the day's type. The
// type cycles through all ten (`BUD_ORDER`) so every Bud owner gets a
// turn every ten days, which is exactly the thing that's easy to miss
// without a reminder.
//
// Three facts decide the card, all of them plain state reads or the one
// upstream helper that owns the rotation:
//   1. today's type — `getDailyBudBoxType`, the same call the Plaza's
//      availability indicator and the box's own modal make;
//   2. does the player hold a Bud of that type — `state.buds`;
//   3. has the box already been opened today —
//      `state.pumpkinPlaza.budBox.openedAt`, compared on the UTC day.
//
// (3) is the one check upstream has no exported helper for: `PlazaScene`
// and `BudBox.tsx` each inline their own (an ISO-date-prefix compare and
// a `getDayOfYear` compare respectively — the latter collides across
// years). We follow the Plaza's ISO compare, since the Plaza indicator
// is the signal this card mirrors. It's UTC calendar arithmetic, not
// game logic, and it's the same boundary `loveIsland.ts` draws for its
// own `nextUtcMidnight`.

// Next UTC midnight — when the box resets and the type rolls over.
function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function isSameUtcDay(a: number, b: number): boolean {
  return (
    new Date(a).toISOString().slice(0, 10) ===
    new Date(b).toISOString().slice(0, 10)
  );
}

export function extractBudBoxTimers(
  state: GameState,
  { now }: TimerContext,
): Timer[] {
  const buds = Object.values(state.buds ?? {});
  // No Buds, no box: it can never be opened, so the section shouldn't
  // exist for this farm at all (see EVENT_GATED_CATEGORIES).
  if (buds.length === 0) return [];

  const todayType = getDailyBudBoxType(now);
  const hasTodayBud = buds.some((bud) => bud.type === todayType);

  const openedAt = state.pumpkinPlaza?.budBox?.openedAt ?? 0;
  const openedToday = !!openedAt && isSameUtcDay(openedAt, now);

  // Ready right now only when the player can actually walk up and open
  // it. Otherwise count down to the reset — which is when the type rolls
  // over (so a player without today's Bud may be eligible tomorrow) and
  // when an already-opened box comes back.
  const available = hasTodayBud && !openedToday;

  return [
    {
      id: "bud-box",
      category: "Bud Box",
      label: "Bud Box",
      icon: CHROME_ICONS.gift,
      readyAt: available ? now : nextUtcMidnight(now),
      // The type is the whole point of the card: it tells the player
      // whether today is their day, and which of their Buds to bring.
      subtext: openedToday
        ? `Opened today · ${todayType} Buds`
        : hasTodayBud
          ? `${todayType} Buds today`
          : `${todayType} Buds today — none held`,
      // The reward is a server-rolled chest, so there's nothing to
      // predict.
      //
      // Notifies through the ready DIGEST rather than the per-instance
      // alarm path, for the same reason salt nodes and beehives do:
      // "openable" is a sustained state, not a moment. `readyAt = now`
      // would churn the alarm path's `${key}@${readyAt}` fire key on
      // every 10-min sweep and re-push all day, and scheduling the fire
      // at the reset instead would land copy derived from the PREVIOUS
      // day's type — the rotation turns over at that exact instant. The
      // digest dedups on the stable `aggregationKey`, so the box
      // notifies once when it opens to the player and stays quiet until
      // they open it (or the type rolls past them).
      notifyDigest: { ready: available, group: "Bud Box", noun: "Bud Box" },
      aggregationKey: "Bud Box",
    },
  ];
}
