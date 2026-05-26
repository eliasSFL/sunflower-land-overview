import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream re-export module so the extractor's three value
// dependencies (`getActiveFloatingIsland`, `hasClaimedPetalPrize`,
// `getItemIcon`) are controlled per test. The boundary rule in
// CLAUDE.md says we never replicate upstream — that holds at runtime,
// and at test time the easiest way to honour it is to NOT exercise the
// real implementations here. We're testing the extractor's branching
// logic and emitted timer shape, not upstream's schedule lookup.
//
// `vi.mock` is hoisted above the imports below by Vitest's transform,
// so the mock factory runs before `loveIsland.ts` resolves its import
// of `../game/index.ts` — both the test file and the SUT see the same
// vi.fn instances.
vi.mock("../game/index.ts", () => ({
  getActiveFloatingIsland: vi.fn(),
  hasClaimedPetalPrize: vi.fn(),
  // Deterministic prefix so assertions can match exact strings instead
  // of mirroring upstream's CDN URL format.
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
}));

import {
  getActiveFloatingIsland,
  hasClaimedPetalPrize,
  type GameState,
} from "../game/index.ts";
import { extractLoveIslandTimers } from "./loveIsland.ts";
import type { TimerContext } from "./types.ts";

const mockGetActive = vi.mocked(getActiveFloatingIsland);
const mockHasClaimed = vi.mocked(hasClaimedPetalPrize);

// Fixed wall-clock for every test. Noon UTC keeps the next-UTC-midnight
// calculation 12h away, away from any boundary that could mask off-by-
// one bugs in the puzzle-reset arithmetic.
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const NEXT_UTC_MIDNIGHT = Date.UTC(2026, 5, 16, 0, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

const ctx: TimerContext = {
  farmId: 1,
  now: NOW,
  counter: { next: () => 0 },
};

// The extractor only reads `state.floatingIsland`; the cast keeps the
// test fixture small without forcing us to hand-build a full GameState
// (which would couple the test to every upstream field rename).
function stateWithSchedule(
  schedule: Array<{ startAt: number; endAt: number }>,
): GameState {
  return { floatingIsland: { schedule } } as unknown as GameState;
}

beforeEach(() => {
  mockGetActive.mockReset();
  mockHasClaimed.mockReset();
});

describe("extractLoveIslandTimers", () => {
  describe("guard rails", () => {
    it("returns no timers when state.floatingIsland is missing", () => {
      // Sanitised payload edge case — extractor must short-circuit
      // before calling getActiveFloatingIsland (which would throw on
      // a missing field).
      const state = {} as unknown as GameState;
      const result = extractLoveIslandTimers(state, ctx);
      expect(result).toEqual([]);
      expect(mockGetActive).not.toHaveBeenCalled();
    });
  });

  describe("while the island is live", () => {
    const endAt = NOW + HOUR_MS;
    const active = { startAt: NOW - HOUR_MS, endAt };

    beforeEach(() => {
      mockGetActive.mockReturnValue(active);
    });

    it("emits the close-countdown card with notify disabled", () => {
      mockHasClaimed.mockReturnValue(false);
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);

      const window = result.find((t) => t.id === "love-island:window");
      // The dashboard card counts to the REAL endAt — repurposing it
      // for the 5-min headsup would lie about how long the player has.
      expect(window).toMatchObject({
        category: "Love Island",
        label: "Island closes",
        icon: "icon:Love Charm",
        readyAt: endAt,
        notify: false,
      });
    });

    it("emits a pushOnly closing-soon headsup 5 minutes before endAt", () => {
      mockHasClaimed.mockReturnValue(false);
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);

      const closingSoon = result.find(
        (t) => t.id === "love-island:closing-soon",
      );
      // `pushOnly` keeps this off the dashboard — the close-countdown
      // already covers the visual signal. Custom push wording bypasses
      // the worker's default "{label} ready" framing.
      expect(closingSoon).toMatchObject({
        category: "Love Island",
        label: "Closing soon",
        icon: "icon:Love Charm",
        readyAt: endAt - FIVE_MIN_MS,
        pushOnly: true,
        pushTitle: "Love Island closing soon",
        pushBody: "5 minutes left before the island leaves.",
      });
      // Sanity: this timer is NOT opted out of push — the whole point
      // of `pushOnly` is that it fires the push. If `notify: false`
      // ever leaks in alongside it, the worker would skip the fire.
      expect(closingSoon?.notify).toBeUndefined();
    });

    it("emits the petal puzzle as readyAt=now when unclaimed", () => {
      mockHasClaimed.mockReturnValue(false);
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);

      const puzzle = result.find((t) => t.id === "love-island:petal-puzzle");
      // notify: false — user explicitly removed the daily puzzle push.
      // Dashboard card still surfaces the predicted yield so they know
      // there's a Bronze Love Box waiting.
      expect(puzzle).toMatchObject({
        category: "Love Island",
        label: "Petal Puzzle",
        icon: "icon:Bronze Love Box",
        readyAt: NOW,
        notify: false,
        predictedYield: { amount: 1, item: "Bronze Love Box" },
      });
    });

    it("delays the petal puzzle until the next UTC midnight when claimed today", () => {
      mockHasClaimed.mockReturnValue(true);
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);

      const puzzle = result.find((t) => t.id === "love-island:petal-puzzle");
      expect(puzzle?.readyAt).toBe(NEXT_UTC_MIDNIGHT);
      // Other fields don't change between claimed/unclaimed.
      expect(puzzle?.notify).toBe(false);
    });

    it("does not emit an 'Island opens' timer while live", () => {
      mockHasClaimed.mockReturnValue(false);
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);
      // The live branch returns early — the off-season "opens" timer
      // belongs to a different code path entirely. Belt-and-braces in
      // case future refactors collapse the branches.
      expect(result.find((t) => t.label === "Island opens")).toBeUndefined();
    });

    it("emits exactly three timers (window, closing-soon, petal-puzzle)", () => {
      mockHasClaimed.mockReturnValue(false);
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);
      // Pins the cardinality so an accidental fourth-timer addition
      // gets flagged. Order matches the extractor's `out.push` sequence.
      expect(result.map((t) => t.id)).toEqual([
        "love-island:window",
        "love-island:closing-soon",
        "love-island:petal-puzzle",
      ]);
    });
  });

  describe("while the island is between windows", () => {
    beforeEach(() => {
      // Mirrors upstream's "no active window" return.
      mockGetActive.mockReturnValue(undefined);
    });

    it("returns no timers when the schedule is empty", () => {
      // Off-season: the section hides via EVENT_GATED_CATEGORIES in
      // App.tsx, so an empty array is the right signal.
      const result = extractLoveIslandTimers(stateWithSchedule([]), ctx);
      expect(result).toEqual([]);
    });

    it("ignores past windows", () => {
      const past = { startAt: NOW - 2 * HOUR_MS, endAt: NOW - HOUR_MS };
      const result = extractLoveIslandTimers(stateWithSchedule([past]), ctx);
      // `startAt > now` filter — a window that already ended should
      // not resurrect itself as a future "opens" countdown.
      expect(result).toEqual([]);
    });

    it("emits an opens-countdown with push-wording overrides at startAt", () => {
      const next = { startAt: NOW + HOUR_MS, endAt: NOW + 4 * HOUR_MS };
      const result = extractLoveIslandTimers(stateWithSchedule([next]), ctx);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "love-island:window",
        category: "Love Island",
        label: "Island opens",
        icon: "icon:Love Charm",
        readyAt: next.startAt,
        pushTitle: "Love Island is open",
        pushBody:
          "Hop on the hot-air balloon — the Floating Island has arrived.",
      });
      // Opens IS the headline user-facing push — must NOT carry
      // `notify: false`, must NOT be `pushOnly` (we want the dashboard
      // card too, so players see the countdown).
      expect(result[0].notify).toBeUndefined();
      expect(result[0].pushOnly).toBeUndefined();
    });

    it("picks the earliest future window when multiple are scheduled out of order", () => {
      const later = {
        startAt: NOW + 5 * HOUR_MS,
        endAt: NOW + 6 * HOUR_MS,
      };
      const earlier = {
        startAt: NOW + 1 * HOUR_MS,
        endAt: NOW + 2 * HOUR_MS,
      };
      const past = { startAt: NOW - 2 * HOUR_MS, endAt: NOW - HOUR_MS };
      const result = extractLoveIslandTimers(
        // Deliberately unsorted — the extractor must sort, not assume.
        stateWithSchedule([later, past, earlier]),
        ctx,
      );

      expect(result).toHaveLength(1);
      expect(result[0].readyAt).toBe(earlier.startAt);
    });
  });
});
