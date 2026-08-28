import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream re-export boundary (same pattern as the agingShed /
// loveIsland / quests tests): vitest's node env doesn't resolve the
// submodule's `features/*` aliases, so we stub the extractor's value
// dependencies. What's under test here is the extractor's plumbing —
// that it asks upstream for the queue's ready times per building
// instance, renders those rather than the stored `recipe.readyAt`, and
// orders PRNG counters by the resolved times. The chain arithmetic
// itself is upstream's, covered by cookingReadiness.test.ts there.
vi.mock("../game/index.ts", () => ({
  COOKABLES: { "Boiled Eggs": {}, "Mashed Potato": {} },
  PROCESSED_RESOURCES: { "Fish Fillet": {} },
  getCookingAmount: vi.fn(),
  getProcessedResourceAmount: vi.fn(),
  getCookingQueueReadyAts: vi.fn(),
  getBoostIcon: vi.fn((name: string) => `icon:${name}`),
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
}));

import {
  getCookingAmount,
  getCookingQueueReadyAts,
  getProcessedResourceAmount,
  type GameState,
} from "../game/index.ts";
import { extractCookingTimers } from "./cooking.ts";
import type { TimerContext } from "./types.ts";

const mockReadyAts = vi.mocked(getCookingQueueReadyAts);
const mockCookingAmount = vi.mocked(getCookingAmount);
const mockProcessedAmount = vi.mocked(getProcessedResourceAmount);

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const ctx: TimerContext = {
  farmId: 128727,
  now: NOW,
  counter: { next: () => 0 },
};

type RecipeInput = { name: string; readyAt: number };

/** A cooking building with one queue per instance. */
function stateWith(
  buildings: Record<string, RecipeInput[][]>,
  processing: RecipeInput[][] = [],
): GameState {
  const out: Record<string, unknown[]> = {};
  for (const [name, queues] of Object.entries(buildings)) {
    out[name] = queues.map((queue, i) => ({
      id: `${name}-${i}`,
      coordinates: { x: 0, y: 0 },
      crafting: queue,
    }));
  }
  if (processing.length > 0) {
    out["Fish Market"] = processing.map((queue, i) => ({
      id: `fm-${i}`,
      coordinates: { x: 0, y: 0 },
      processing: queue,
    }));
  }
  return { buildings: out, farmActivity: {} } as unknown as GameState;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookingAmount.mockReturnValue({ amount: 1, boostsUsed: [] } as never);
  mockProcessedAmount.mockReturnValue({
    amount: { toNumber: () => 1 },
    boostsUsed: [],
  } as never);
  // Default: upstream hands back the stored times unchanged.
  mockReadyAts.mockImplementation(
    ({ crafting }) => crafting.map((r) => r.readyAt) as never,
  );
});

describe("extractCookingTimers", () => {
  it("renders the derived ready time, not the stored one", () => {
    // The regression this locks down. A boost placed mid-cook pulls the
    // queue forward, so upstream's derived time sits EARLIER than the
    // `readyAt` cached on the recipe. Rendering the stored value would
    // show a countdown that never matches the game.
    const stored = NOW + 60 * 60_000;
    const derived = NOW + 30 * 60_000;
    mockReadyAts.mockReturnValue([derived] as never);

    const timers = extractCookingTimers(
      stateWith({ "Fire Pit": [[{ name: "Boiled Eggs", readyAt: stored }]] }),
      ctx,
    );

    expect(timers).toHaveLength(1);
    expect(timers[0].readyAt).toBe(derived);
  });

  it("resolves each building instance as its own chain", () => {
    // Two Fire Pits cook independently, so the queues must not be
    // concatenated into one chain — the second pit's first recipe does
    // not start when the first pit's finishes.
    const state = stateWith({
      "Fire Pit": [
        [{ name: "Boiled Eggs", readyAt: NOW + 1000 }],
        [{ name: "Mashed Potato", readyAt: NOW + 2000 }],
      ],
    });

    extractCookingTimers(state, ctx);

    expect(mockReadyAts).toHaveBeenCalledTimes(2);
    expect(mockReadyAts.mock.calls[0][0].crafting).toHaveLength(1);
    expect(mockReadyAts.mock.calls[1][0].crafting).toHaveLength(1);
  });

  it("passes the whole queue so the chain can ripple", () => {
    const queue = [
      { name: "Boiled Eggs", readyAt: NOW + 1000 },
      { name: "Mashed Potato", readyAt: NOW + 2000 },
    ];
    mockReadyAts.mockReturnValue([NOW + 500, NOW + 900] as never);

    const timers = extractCookingTimers(
      stateWith({ "Fire Pit": [queue] }),
      ctx,
    );

    expect(mockReadyAts.mock.calls[0][0].crafting).toHaveLength(2);
    expect(timers.map((t) => t.readyAt)).toEqual([NOW + 500, NOW + 900]);
  });

  // The subtle one. PRNG counters advance in claim order across ALL
  // cooking buildings, so the sort has to run on resolved times. If it
  // used the stored ones, a boosted Kitchen queue would be handed the
  // later counter even though it now finishes first — every predicted
  // yield after it shifts onto the wrong roll.
  it("advances PRNG counters in resolved claim order", () => {
    const state = stateWith({
      "Fire Pit": [[{ name: "Boiled Eggs", readyAt: NOW + 10_000 }]],
      Kitchen: [[{ name: "Boiled Eggs", readyAt: NOW + 20_000 }]],
    });
    // A boost pulled the Kitchen forward: it now finishes FIRST,
    // inverting the stored order.
    mockReadyAts.mockImplementation(({ crafting }) =>
      crafting.map((r) =>
        r.name === "Boiled Eggs" && r.readyAt === NOW + 20_000
          ? NOW + 5_000
          : r.readyAt,
      ),
    );

    extractCookingTimers(state, ctx);

    const order = mockCookingAmount.mock.calls.map((c) => [
      c[0].building,
      c[0].counter,
    ]);
    expect(order).toEqual([
      ["Kitchen", 0],
      ["Fire Pit", 1],
    ]);
  });

  it("leaves Fish Market processing on its stored readyAt", () => {
    // processResource still does a plain `startAt + reducedMs` with no
    // baseDurationMs marker, so there is no chain to resolve for it.
    const readyAt = NOW + 45_000;
    const timers = extractCookingTimers(
      stateWith({}, [[{ name: "Fish Fillet", readyAt }]]),
      ctx,
    );

    // Fish Market does render its own panel, so the card is expected —
    // what must NOT happen is it being run through the cooking chain.
    expect(mockReadyAts).not.toHaveBeenCalled();
    const card = timers.find((t) => t.category === "Fish Market");
    expect(card?.readyAt).toBe(readyAt);
  });

  it("falls back to the stored value if upstream returns a short list", () => {
    mockReadyAts.mockReturnValue([] as never);
    const stored = NOW + 7_000;

    const timers = extractCookingTimers(
      stateWith({ "Fire Pit": [[{ name: "Boiled Eggs", readyAt: stored }]] }),
      ctx,
    );

    expect(timers[0].readyAt).toBe(stored);
  });

  it("emits an idle timer for a placed but empty building", () => {
    const timers = extractCookingTimers(stateWith({ "Fire Pit": [[]] }), ctx);

    expect(timers).toHaveLength(1);
    expect(timers[0].idle).toBe(true);
    expect(mockReadyAts).not.toHaveBeenCalled();
  });
});
