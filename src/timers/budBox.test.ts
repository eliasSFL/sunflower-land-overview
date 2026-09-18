import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream re-export module so the rotation is controlled per
// test. The boundary rule in CLAUDE.md says we never replicate upstream
// — that holds at runtime, and at test time the easiest way to honour it
// is to NOT exercise the real implementation here. We're testing the
// extractor's branching and emitted timer shape, not upstream's ten-day
// bud-type cycle.
vi.mock("../game/index.ts", () => ({
  getDailyBudBoxType: vi.fn(),
}));

import { getDailyBudBoxType, type GameState } from "../game/index.ts";
import { extractBudBoxTimers } from "./budBox.ts";
import type { TimerContext } from "./types.ts";

const mockDailyType = vi.mocked(getDailyBudBoxType);

// Noon UTC so the next-UTC-midnight reset is 12h away, clear of any
// boundary that could mask off-by-one bugs in the reset arithmetic.
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const NEXT_UTC_MIDNIGHT = Date.UTC(2026, 5, 16, 0, 0, 0);
const EARLIER_TODAY = Date.UTC(2026, 5, 15, 3, 0, 0);
const YESTERDAY = Date.UTC(2026, 5, 14, 23, 0, 0);

const ctx: TimerContext = {
  farmId: 1,
  now: NOW,
  counter: { next: () => 0 },
};

// The extractor only reads `state.buds` and `state.pumpkinPlaza`; the
// cast keeps the fixture small without hand-building a full GameState
// (which would couple the test to every upstream field rename).
function stateWith({
  budTypes = [],
  openedAt,
}: {
  budTypes?: string[];
  openedAt?: number;
}): GameState {
  return {
    buds: Object.fromEntries(budTypes.map((type, i) => [i + 1, { type }])),
    pumpkinPlaza: openedAt === undefined ? {} : { budBox: { openedAt } },
  } as unknown as GameState;
}

beforeEach(() => {
  mockDailyType.mockReset();
  mockDailyType.mockReturnValue("Plaza");
});

describe("extractBudBoxTimers", () => {
  it("emits nothing for a farm with no Buds", () => {
    // The box is opened with a Bud, so a Bud-less farm can never use it
    // — the whole section should stay hidden (EVENT_GATED_CATEGORIES).
    expect(extractBudBoxTimers(stateWith({}), ctx)).toEqual([]);
    // Cheap guard: don't even ask upstream which type it is.
    expect(mockDailyType).not.toHaveBeenCalled();
  });

  it("is ready now when the player holds today's type and hasn't opened it", () => {
    const result = extractBudBoxTimers(
      stateWith({ budTypes: ["Plaza", "Cave"] }),
      ctx,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "bud-box",
      category: "Bud Box",
      label: "Bud Box",
      readyAt: NOW,
      subtext: "Plaza Buds today",
      // Sustained state, so it notifies through the ready digest (stable
      // key dedup) rather than the readyAt alarm path, which would churn
      // its fire key every sweep.
      notifyDigest: { ready: true, group: "Bud Box", noun: "Bud Box" },
      aggregationKey: "Bud Box",
    });
    // Today's type comes from upstream's rotation, asked at our clock.
    expect(mockDailyType).toHaveBeenCalledWith(NOW);
  });

  it("counts down to the reset when the player holds no Bud of today's type", () => {
    mockDailyType.mockReturnValue("Snow");
    const result = extractBudBoxTimers(
      stateWith({ budTypes: ["Plaza", "Cave"] }),
      ctx,
    );

    // Still worth a card: the type rolls over at the same instant the
    // box resets, so the countdown is "when might it be my turn".
    expect(result[0]).toMatchObject({
      readyAt: NEXT_UTC_MIDNIGHT,
      subtext: "Snow Buds today — none held",
    });
    // Not openable → not in the digest's ready set, so no push.
    expect(result[0].notifyDigest?.ready).toBe(false);
  });

  it("counts down to the reset once the box has been opened today", () => {
    const result = extractBudBoxTimers(
      stateWith({ budTypes: ["Plaza"], openedAt: EARLIER_TODAY }),
      ctx,
    );

    expect(result[0]).toMatchObject({
      readyAt: NEXT_UTC_MIDNIGHT,
      subtext: "Opened today · Plaza Buds",
    });
    // Dropping out of the ready set is what re-arms the digest for the
    // next time the box opens to this player.
    expect(result[0].notifyDigest?.ready).toBe(false);
  });

  it("treats a box opened before UTC midnight as available again", () => {
    // The reset is UTC-day based, so an open at 23:00 yesterday must not
    // still count this morning.
    const result = extractBudBoxTimers(
      stateWith({ budTypes: ["Plaza"], openedAt: YESTERDAY }),
      ctx,
    );

    expect(result[0]).toMatchObject({
      readyAt: NOW,
      subtext: "Plaza Buds today",
    });
  });

  it("tolerates a farm with Buds but no pumpkinPlaza budBox record", () => {
    // A player who has never opened the box has no `openedAt` at all.
    const result = extractBudBoxTimers(stateWith({ budTypes: ["Plaza"] }), ctx);
    expect(result[0]?.readyAt).toBe(NOW);
  });
});
