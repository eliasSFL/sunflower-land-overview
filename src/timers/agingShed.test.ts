import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream re-export boundary (same pattern as loveIsland /
// quests tests): vitest's node env doesn't resolve the submodule's
// `features/*` aliases, so we stub the extractor's value dependencies.
// The REAL seeded-PRNG correctness — that the flagged slot matches what
// upstream actually rolls — was verified live against farm 128727
// (counter 36, 24% chance → the 3rd collect, counter 38, is prime).
// Here we test the extractor's plumbing: that it maps upstream's
// per-slot `lastAgingCollect` onto the right slot, surfaces the Prime
// Aged item name, and renders the chance headline.
vi.mock("../game/index.ts", () => ({
  collectAgedFish: vi.fn(),
  getPrimeAgedChance: vi.fn(),
  getRefinedSaltChance: vi.fn(),
  predictSpiceOutputs: vi.fn(),
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
  getFermentationRecipe: vi.fn(),
  getSpiceRackRecipe: vi.fn(),
  getObjectEntries: vi.fn((obj: object) => Object.entries(obj ?? {})),
}));

import {
  collectAgedFish,
  getPrimeAgedChance,
  getRefinedSaltChance,
  getSpiceRackRecipe,
  predictSpiceOutputs,
  type GameState,
} from "../game/index.ts";
import { extractAgingShedTimers } from "./agingShed.ts";
import type { TimerContext } from "./types.ts";

const mockCollect = vi.mocked(collectAgedFish);
const mockChance = vi.mocked(getPrimeAgedChance);
const mockRefinedChance = vi.mocked(getRefinedSaltChance);
const mockSpiceRecipe = vi.mocked(getSpiceRackRecipe);
const mockPredictSpice = vi.mocked(predictSpiceOutputs);

const NOW = Date.UTC(2026, 5, 30, 12, 0, 0);
const ctx: TimerContext = {
  farmId: 128727,
  now: NOW,
  counter: { next: () => 0 },
};

type AgingSlotInput = { id: string; fish: string; readyAt: number };
type SpiceJobInput = { id: string; recipe: string; readyAt: number };

function stateWith(
  aging: AgingSlotInput[],
  spice: SpiceJobInput[] = [],
): GameState {
  return {
    buildings: { "Aging Shed": [{ coordinates: { x: 0, y: 0 } }] },
    agingShed: {
      racks: {
        aging: aging.map((s) => ({
          id: s.id,
          fish: s.fish,
          startedAt: NOW - 1_000_000,
          readyAt: s.readyAt,
          skills: { Ager: true },
        })),
        fermentation: [],
        spice: spice.map((s) => ({
          id: s.id,
          recipe: s.recipe,
          startedAt: NOW - 1_000_000,
          readyAt: s.readyAt,
        })),
      },
    },
  } as unknown as GameState;
}

function agingCard(state: GameState) {
  const card = extractAgingShedTimers(state, ctx).find(
    (c) => c.category === "Aging Rack",
  );
  if (!card) throw new Error("no Aging Rack card");
  return card;
}

// Make the upstream dry-run return one `lastAgingCollect` entry per
// queued slot, marking the slots whose index is in `primeIndices` prime
// — mirroring how the real collectAgedFish drains the whole queue when
// passed a future `createdAt`.
function collectMarksPrime(primeIndices: number[]) {
  mockCollect.mockImplementation((({ state }: { state: GameState }) => {
    const queue = state.agingShed?.racks?.aging ?? [];
    return {
      agingShed: {
        lastAgingCollect: queue.map((slot, i) => ({
          item: primeIndices.includes(i)
            ? `Prime Aged ${slot.fish}`
            : `Aged ${slot.fish}`,
          primeAged: primeIndices.includes(i),
        })),
      },
    };
  }) as unknown as typeof collectAgedFish);
}

function spiceCard(state: GameState) {
  const card = extractAgingShedTimers(state, ctx).find(
    (c) => c.category === "Spice Rack",
  );
  if (!card) throw new Error("no Spice Rack card");
  return card;
}

beforeEach(() => {
  mockCollect.mockReset();
  mockChance.mockReset();
  mockChance.mockReturnValue(24);
  mockRefinedChance.mockReset();
  mockRefinedChance.mockReturnValue(0);
  // Default: no per-slot predictions — spice slots fall back to the static
  // recipe output. Individual tests override to assert the +1 amount.
  mockPredictSpice.mockReset();
  mockPredictSpice.mockReturnValue(new Map());
  // Each spice recipe outputs a single item named after the recipe, amount 1.
  mockSpiceRecipe.mockReset();
  mockSpiceRecipe.mockImplementation(((recipe: string) => ({
    outputs: { [recipe]: { toNumber: () => 1 } },
  })) as unknown as typeof getSpiceRackRecipe);
});

describe("extractAgingShedTimers — Prime Aged prediction", () => {
  it("flags the exact slot upstream rolls prime and leaves the rest aged", () => {
    collectMarksPrime([2]); // 3rd collect is prime
    const state = stateWith(
      Array.from({ length: 6 }, (_, i) => ({
        id: `ray-${i}`,
        fish: "Ray",
        readyAt: NOW + i * 1000,
      })),
    );

    const slots = agingCard(state).slots ?? [];
    expect(slots).toHaveLength(6);
    // Sorted by readyAt ascending == queue order, so index 2 is prime.
    expect(slots.map((s) => s.item)).toEqual([
      "Aged Ray",
      "Aged Ray",
      "Prime Aged Ray",
      "Aged Ray",
      "Aged Ray",
      "Aged Ray",
    ]);
    expect(slots[2].icon).toBe("icon:Prime Aged Ray");
  });

  it("maps each prime flip back to its own slot, in readyAt order", () => {
    collectMarksPrime([0, 3]);
    // Provide slots out of readyAt order to prove the index→slot mapping
    // is by queue position (what upstream collects), then re-sorted for
    // display.
    const state = stateWith([
      { id: "a", fish: "Tuna", readyAt: NOW + 100 },
      { id: "b", fish: "Tuna", readyAt: NOW + 200 },
      { id: "c", fish: "Tuna", readyAt: NOW + 300 },
      { id: "d", fish: "Tuna", readyAt: NOW + 400 },
    ]);
    const items = (agingCard(state).slots ?? []).map((s) => s.item);
    expect(items).toEqual([
      "Prime Aged Tuna",
      "Aged Tuna",
      "Aged Tuna",
      "Prime Aged Tuna",
    ]);
  });

  it("renders the prime-chance headline from upstream getPrimeAgedChance", () => {
    collectMarksPrime([]);
    mockChance.mockReturnValue(24);
    const state = stateWith([{ id: "a", fish: "Ray", readyAt: NOW + 1000 }]);
    expect(agingCard(state).subtext).toBe("Prime chance: 24%");

    mockChance.mockReturnValue(10);
    expect(agingCard(state).subtext).toBe("Prime chance: 10%");
  });

  it("falls back to all-aged if the upstream dry-run throws", () => {
    mockCollect.mockImplementation(() => {
      throw new Error("upstream blew up");
    });
    const state = stateWith([
      { id: "a", fish: "Ray", readyAt: NOW + 1000 },
      { id: "b", fish: "Ray", readyAt: NOW + 2000 },
    ]);
    const slots = agingCard(state).slots ?? [];
    expect(slots.map((s) => s.item)).toEqual(["Aged Ray", "Aged Ray"]);
  });

  it("omits the chance headline and skips the dry-run on an idle rack", () => {
    const state = stateWith([]);
    const card = agingCard(state);
    expect(card.idle).toBe(true);
    expect(card.subtext).toBeUndefined();
    expect(mockCollect).not.toHaveBeenCalled();
  });

  it("emits nothing when the Aging Shed is not placed", () => {
    const state = { buildings: {}, agingShed: { racks: {} } } as GameState;
    expect(extractAgingShedTimers(state, ctx)).toEqual([]);
  });
});

describe("extractAgingShedTimers — Refined Salt +1 headline", () => {
  it("renders the +1 chance from upstream when Refiner is active and a Refined Salt job is in flight", () => {
    mockRefinedChance.mockReturnValue(15);
    const state = stateWith(
      [],
      [{ id: "s1", recipe: "Refined Salt", readyAt: NOW + 1000 }],
    );
    expect(spiceCard(state).subtext).toBe("Refined Salt +1 chance: 15%");
  });

  it("omits the headline when the player lacks Refiner (chance 0)", () => {
    mockRefinedChance.mockReturnValue(0);
    const state = stateWith(
      [],
      [{ id: "s1", recipe: "Refined Salt", readyAt: NOW + 1000 }],
    );
    expect(spiceCard(state).subtext).toBeUndefined();
  });

  it("omits the headline when no Refined Salt job is in flight, even with Refiner", () => {
    // Refiner only bonuses `Refined Salt` outputs, so a Salt Lick job
    // alone must not surface the headline.
    mockRefinedChance.mockReturnValue(15);
    const state = stateWith(
      [],
      [{ id: "s1", recipe: "Salt Lick", readyAt: NOW + 1000 }],
    );
    expect(spiceCard(state).subtext).toBeUndefined();
  });

  it("has no headline on an idle spice rack", () => {
    mockRefinedChance.mockReturnValue(15);
    const card = spiceCard(stateWith([], []));
    expect(card.idle).toBe(true);
    expect(card.subtext).toBeUndefined();
  });
});

describe("extractAgingShedTimers — Refined Salt +1 per-slot prediction", () => {
  it("shows the predicted +1 amount on the exact slot upstream rolls a bonus", () => {
    // Two Refined Salt jobs; predictSpiceOutputs says the second rolls the
    // bonus (amount 2). The extractor must surface each job's own amount.
    mockPredictSpice.mockReturnValue(
      new Map([
        ["s1", [{ item: "Refined Salt", amount: 1 }]],
        ["s2", [{ item: "Refined Salt", amount: 2 }]],
      ]),
    );
    const state = stateWith(
      [],
      [
        { id: "s1", recipe: "Refined Salt", readyAt: NOW + 1000 },
        { id: "s2", recipe: "Refined Salt", readyAt: NOW + 2000 },
      ],
    );
    const slots = spiceCard(state).slots ?? [];
    expect(slots.map((s) => s.amount)).toEqual([1, 2]);
    expect(slots.map((s) => s.item)).toEqual(["Refined Salt", "Refined Salt"]);
  });

  it("passes the spice queue and farmId to predictSpiceOutputs", () => {
    mockPredictSpice.mockReturnValue(new Map());
    const state = stateWith(
      [],
      [{ id: "s1", recipe: "Refined Salt", readyAt: NOW + 1000 }],
    );
    spiceCard(state);
    expect(mockPredictSpice).toHaveBeenCalledWith(
      expect.objectContaining({
        farmId: ctx.farmId,
        jobs: expect.arrayContaining([expect.objectContaining({ id: "s1" })]),
      }),
    );
  });

  it("falls back to the static recipe output when a job has no prediction", () => {
    // Empty prediction map → spiceSlotEntry uses getSpiceRackRecipe (amount 1).
    mockPredictSpice.mockReturnValue(new Map());
    const state = stateWith(
      [],
      [{ id: "s1", recipe: "Refined Salt", readyAt: NOW + 1000 }],
    );
    const slots = spiceCard(state).slots ?? [];
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ item: "Refined Salt", amount: 1 });
  });
});
