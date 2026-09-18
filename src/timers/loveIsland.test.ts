import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream re-export module so the extractor's value
// dependencies are controlled per test. The boundary rule in CLAUDE.md
// says we never replicate upstream — that holds at runtime, and at test
// time the easiest way to honour it is to NOT exercise the real
// implementations here. We're testing the extractor's branching logic
// and emitted timer shape, not upstream's schedule lookup, its puzzle
// rotation, or its UTC-day claim ledger.
//
// `vi.mock` is hoisted above the imports below by Vitest's transform,
// so the mock factory runs before `loveIsland.ts` resolves its import
// of `../game/index.ts` — both the test file and the SUT see the same
// vi.fn instances.
vi.mock("../game/index.ts", () => ({
  getActiveFloatingIsland: vi.fn(),
  getLoveIslandCentrePuzzle: vi.fn(),
  getLoveIslandDailyGame: vi.fn(),
  hasClaimedLovePushToday: vi.fn(),
  hasClaimedLoveButtonsToday: vi.fn(),
  hasClaimedLoveBoulderToday: vi.fn(),
  hasClaimedLoveKrakenToday: vi.fn(),
  getLoveDilemmaAttemptsLeft: vi.fn(),
  getFloatingIslandLoveCharmsRemainingToday: vi.fn(),
  getFloatingIslandDailyLoveCharmLimit: vi.fn(),
  // Both item-paying puzzles carry the same prize upstream.
  LOVE_PUSH_PRIZE: { item: "Bronze Love Box", amount: 1 },
  LOVE_BUTTONS_PRIZE: { item: "Bronze Love Box", amount: 1 },
  LOVE_DILEMMA_MAX_ATTEMPTS: 3,
  // Deterministic prefix so assertions can match exact strings instead
  // of mirroring upstream's CDN URL format.
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
}));

import {
  getActiveFloatingIsland,
  getFloatingIslandDailyLoveCharmLimit,
  getFloatingIslandLoveCharmsRemainingToday,
  getLoveDilemmaAttemptsLeft,
  getLoveIslandCentrePuzzle,
  getLoveIslandDailyGame,
  hasClaimedLoveBoulderToday,
  hasClaimedLoveButtonsToday,
  hasClaimedLoveKrakenToday,
  hasClaimedLovePushToday,
  type GameState,
} from "../game/index.ts";
import { extractLoveIslandTimers } from "./loveIsland.ts";
import type { TimerContext } from "./types.ts";

const mockGetActive = vi.mocked(getActiveFloatingIsland);
const mockCentrePuzzle = vi.mocked(getLoveIslandCentrePuzzle);
const mockDailyGame = vi.mocked(getLoveIslandDailyGame);
const mockClaimedPush = vi.mocked(hasClaimedLovePushToday);
const mockClaimedButtons = vi.mocked(hasClaimedLoveButtonsToday);
const mockClaimedBoulder = vi.mocked(hasClaimedLoveBoulderToday);
const mockClaimedKraken = vi.mocked(hasClaimedLoveKrakenToday);
const mockAttemptsLeft = vi.mocked(getLoveDilemmaAttemptsLeft);
const mockCharmsRemaining = vi.mocked(
  getFloatingIslandLoveCharmsRemainingToday,
);
const mockCharmLimit = vi.mocked(getFloatingIslandDailyLoveCharmLimit);

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
  vi.mocked(getActiveFloatingIsland).mockReset();
  mockCentrePuzzle.mockReset();
  mockDailyGame.mockReset();
  mockClaimedPush.mockReset();
  mockClaimedButtons.mockReset();
  mockClaimedBoulder.mockReset();
  mockClaimedKraken.mockReset();
  mockAttemptsLeft.mockReset();
  mockCharmsRemaining.mockReset();
  mockCharmLimit.mockReset();

  // Sensible island-day defaults: the rotation upstream actually ships
  // (Push / Buttons in the centre, Boulder / Marvel as the crowd game),
  // nothing claimed yet.
  mockCentrePuzzle.mockReturnValue("push");
  mockDailyGame.mockReturnValue("boulder");
  mockClaimedPush.mockReturnValue(false);
  mockClaimedButtons.mockReturnValue(false);
  mockClaimedBoulder.mockReturnValue(false);
  mockClaimedKraken.mockReturnValue(false);
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

    describe("the centre puzzle", () => {
      it("names Lover's Push and predicts its box when it is today's puzzle", () => {
        mockCentrePuzzle.mockReturnValue("push");
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const puzzle = result.find((t) => t.id === "love-island:centre-puzzle");
        // notify: false — the daily puzzles are dashboard signals, not
        // pushes (same call the old petal puzzle card made).
        expect(puzzle).toMatchObject({
          category: "Love Island",
          label: "Lover's Push",
          icon: "icon:Bronze Love Box",
          readyAt: NOW,
          notify: false,
          predictedYield: { amount: 1, item: "Bronze Love Box" },
        });
        // The rotation decides which ledger is consulted — reading the
        // wrong one would report another puzzle's claim.
        expect(mockClaimedPush).toHaveBeenCalledWith({
          state: expect.anything(),
          now: NOW,
        });
        expect(mockClaimedButtons).not.toHaveBeenCalled();
      });

      it("names Love Buttons and reads its own ledger on a buttons day", () => {
        mockCentrePuzzle.mockReturnValue("buttons");
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const puzzle = result.find((t) => t.id === "love-island:centre-puzzle");
        expect(puzzle).toMatchObject({
          label: "Love Buttons",
          readyAt: NOW,
          predictedYield: { amount: 1, item: "Bronze Love Box" },
        });
        expect(mockClaimedButtons).toHaveBeenCalled();
        expect(mockClaimedPush).not.toHaveBeenCalled();
      });

      it("delays the centre puzzle to the next UTC midnight once claimed today", () => {
        mockClaimedPush.mockReturnValue(true);
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const puzzle = result.find((t) => t.id === "love-island:centre-puzzle");
        expect(puzzle?.readyAt).toBe(NEXT_UTC_MIDNIGHT);
        // Other fields don't change between claimed/unclaimed.
        expect(puzzle?.notify).toBe(false);
      });

      it("reports attempts left instead of a yield on a Dilemma day", () => {
        // The Dilemma only runs if upstream pins it back on via
        // LOVE_ISLAND_CENTRE_PUZZLE_OVERRIDE, but it pays Love Charms
        // up to three times a day rather than one fixed box, so the
        // card has a different shape.
        mockCentrePuzzle.mockReturnValue("dilemma");
        mockAttemptsLeft.mockReturnValue(2);
        mockCharmsRemaining.mockReturnValue(4);
        mockCharmLimit.mockReturnValue(5);

        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const puzzle = result.find((t) => t.id === "love-island:centre-puzzle");
        expect(puzzle).toMatchObject({
          label: "Lover's Dilemma",
          icon: "icon:Love Charm",
          readyAt: NOW,
          subtext: "2/3 attempts left",
          notify: false,
        });
        // Charms are capped island-wide, not per-claim, so no yield.
        expect(puzzle?.predictedYield).toBeUndefined();
      });

      it("waits for the UTC reset when the Dilemma's attempts are spent", () => {
        mockCentrePuzzle.mockReturnValue("dilemma");
        mockAttemptsLeft.mockReturnValue(0);
        mockCharmsRemaining.mockReturnValue(0);
        mockCharmLimit.mockReturnValue(5);

        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const puzzle = result.find((t) => t.id === "love-island:centre-puzzle");
        expect(puzzle?.readyAt).toBe(NEXT_UTC_MIDNIGHT);
        expect(puzzle?.subtext).toBe("0/3 attempts left");
      });
    });

    describe("the crowd game", () => {
      it("names the Love Boulder and carries no predicted yield", () => {
        mockDailyGame.mockReturnValue("boulder");
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const game = result.find((t) => t.id === "love-island:daily-game");
        expect(game).toMatchObject({
          category: "Love Island",
          label: "Love Boulder",
          readyAt: NOW,
          subtext: "Box or coins",
          notify: false,
        });
        // The prize is rolled server-side — the client never holds the
        // seed, so predicting one would be a guess.
        expect(game?.predictedYield).toBeUndefined();
        expect(mockClaimedBoulder).toHaveBeenCalled();
        expect(mockClaimedKraken).not.toHaveBeenCalled();
      });

      it("names the Love Marvel and reads its own ledger on a kraken day", () => {
        mockDailyGame.mockReturnValue("kraken");
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const game = result.find((t) => t.id === "love-island:daily-game");
        expect(game?.label).toBe("Love Marvel");
        expect(mockClaimedKraken).toHaveBeenCalled();
        expect(mockClaimedBoulder).not.toHaveBeenCalled();
      });

      it("delays the crowd game to the next UTC midnight once claimed today", () => {
        mockClaimedBoulder.mockReturnValue(true);
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const game = result.find((t) => t.id === "love-island:daily-game");
        expect(game?.readyAt).toBe(NEXT_UTC_MIDNIGHT);
        expect(game?.subtext).toBe("Claimed today");
      });
    });

    describe("the daily Love Charm cap", () => {
      it("is omitted when no Charm-paying puzzle is on", () => {
        // Push / Buttons pay an item and the Boulder / Marvel are paid
        // server-side; upstream exempts all of them from the cap, so
        // nothing on a normal island day can move the number.
        mockCentrePuzzle.mockReturnValue("push");
        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        expect(
          result.find((t) => t.id === "love-island:love-charm-cap"),
        ).toBeUndefined();
        expect(mockCharmsRemaining).not.toHaveBeenCalled();
      });

      it("surfaces the remaining charms and the VIP-gated limit on a Dilemma day", () => {
        mockCentrePuzzle.mockReturnValue("dilemma");
        mockAttemptsLeft.mockReturnValue(3);
        mockCharmsRemaining.mockReturnValue(40);
        mockCharmLimit.mockReturnValue(100);

        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        expect(
          result.find((t) => t.id === "love-island:love-charm-cap"),
        ).toMatchObject({
          label: "Love Charms",
          icon: "icon:Love Charm",
          readyAt: NOW,
          subtext: "40/100 left today",
          notify: false,
        });
      });

      it("counts down to the UTC reset when the cap is spent", () => {
        mockCentrePuzzle.mockReturnValue("dilemma");
        mockAttemptsLeft.mockReturnValue(1);
        mockCharmsRemaining.mockReturnValue(0);
        mockCharmLimit.mockReturnValue(5);

        const result = extractLoveIslandTimers(
          stateWithSchedule([active]),
          ctx,
        );

        const cap = result.find((t) => t.id === "love-island:love-charm-cap");
        expect(cap?.readyAt).toBe(NEXT_UTC_MIDNIGHT);
        expect(cap?.subtext).toBe("0/5 left today");
      });
    });

    it("does not emit an 'Island opens' timer while live", () => {
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);
      // The live branch returns early — the off-season "opens" timer
      // belongs to a different code path entirely. Belt-and-braces in
      // case future refactors collapse the branches.
      expect(result.find((t) => t.label === "Island opens")).toBeUndefined();
    });

    it("emits exactly four timers on a normal island day", () => {
      // Pins the cardinality so an accidental extra card gets flagged.
      // Order matches the extractor's `out.push` sequence.
      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);
      expect(result.map((t) => t.id)).toEqual([
        "love-island:window",
        "love-island:closing-soon",
        "love-island:centre-puzzle",
        "love-island:daily-game",
      ]);
    });

    it("adds the charm cap as a fifth timer on a Dilemma day", () => {
      mockCentrePuzzle.mockReturnValue("dilemma");
      mockAttemptsLeft.mockReturnValue(3);
      mockCharmsRemaining.mockReturnValue(5);
      mockCharmLimit.mockReturnValue(5);

      const result = extractLoveIslandTimers(stateWithSchedule([active]), ctx);
      expect(result.map((t) => t.id)).toEqual([
        "love-island:window",
        "love-island:closing-soon",
        "love-island:centre-puzzle",
        "love-island:daily-game",
        "love-island:love-charm-cap",
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

    it("emits no puzzle cards while the island is unreachable", () => {
      // The puzzles only exist on the island, so counting down to one
      // the player cannot walk to would be noise.
      const next = { startAt: NOW + HOUR_MS, endAt: NOW + 4 * HOUR_MS };
      const result = extractLoveIslandTimers(stateWithSchedule([next]), ctx);
      expect(
        result.find(
          (t) =>
            t.id === "love-island:centre-puzzle" ||
            t.id === "love-island:daily-game",
        ),
      ).toBeUndefined();
      expect(mockCentrePuzzle).not.toHaveBeenCalled();
      expect(mockDailyGame).not.toHaveBeenCalled();
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
