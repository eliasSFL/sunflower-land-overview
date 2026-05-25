import {
  getActiveFloatingIsland,
  hasClaimedPetalPrize,
  getItemIcon,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// "Love Island" is the in-game Floating Island event: a hot-air balloon
// ferries players to a temporary island that opens on a schedule. Two
// time-gated mechanics surface here:
//   1. the live window itself (when the island opens / closes), and
//   2. the daily Petal Puzzle, which grants one Bronze Love Box per UTC
//      day while the island is live.
// Both decisions are delegated to upstream helpers (boundary rule) — we
// never re-derive the schedule lookup or the UTC-day comparison ourselves.

// Next UTC midnight. Generic calendar math, NOT game logic: the
// "claimed today?" decision is delegated to upstream hasClaimedPetalPrize
// (which keys on UTC day strings); we only need the reset instant so the
// card can count down to when the puzzle is claimable again.
function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function extractLoveIslandTimers(
  state: GameState,
  { now }: TimerContext,
): Timer[] {
  const out: Timer[] = [];

  // The API *should* always ship `floatingIsland` (it's a required
  // GameState field), but guard anyway: if a sanitised payload ever
  // drops it, render nothing rather than letting getActiveFloatingIsland
  // throw and take the whole extraction pass down.
  if (!state.floatingIsland) return out;

  const active = getActiveFloatingIsland({ state });

  if (active) {
    // 1) Live window — count down to when the island closes. Dashboard
    //    countdown only (notify: false): an "Island closes ready" push
    //    at the moment the event ends would be nonsense.
    out.push({
      id: "love-island:window",
      category: "Love Island",
      label: "Island closes",
      icon: getItemIcon("Love Charm"),
      readyAt: active.endAt,
      notify: false,
    });

    // 2) Petal Puzzle — one Bronze Love Box per UTC day, claimable only
    //    while the island is live. readyAt = now when it's available to
    //    claim; otherwise the next UTC midnight when the daily resets.
    const claimed = hasClaimedPetalPrize({ state, createdAt: now });
    out.push({
      id: "love-island:petal-puzzle",
      category: "Love Island",
      label: "Petal Puzzle",
      icon: getItemIcon("Bronze Love Box"),
      readyAt: claimed ? nextUtcMidnight(now) : now,
      predictedYield: { amount: 1, item: "Bronze Love Box" },
    });

    return out;
  }

  // Not live — surface the next scheduled opening, if any. Off-season
  // (nothing live and nothing on the calendar) emits no timers, so the
  // section stays hidden via the event-gating in App.tsx.
  const next = state.floatingIsland.schedule
    .filter((w) => w.startAt > now)
    .sort((a, b) => a.startAt - b.startAt)[0];

  if (next) {
    out.push({
      id: "love-island:window",
      category: "Love Island",
      label: "Island opens",
      icon: getItemIcon("Love Charm"),
      readyAt: next.startAt,
      notify: false,
    });
  }

  return out;
}
