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
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
  getFermentationRecipe: vi.fn(),
  getSpiceRackRecipe: vi.fn(),
  getObjectEntries: vi.fn((obj: object) => Object.entries(obj ?? {})),
}));

import {
  collectAgedFish,
  getPrimeAgedChance,
  type GameState,
} from "../game/index.ts";
import { extractAgingShedTimers } from "./agingShed.ts";
import type { TimerContext } from "./types.ts";

const mockCollect = vi.mocked(collectAgedFish);
const mockChance = vi.mocked(getPrimeAgedChance);

const NOW = Date.UTC(2026, 5, 30, 12, 0, 0);
const ctx: TimerContext = {
  farmId: 128727,
  now: NOW,
  counter: { next: () => 0 },
};

type AgingSlotInput = { id: string; fish: string; readyAt: number };

function stateWith(aging: AgingSlotInput[]): GameState {
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
        spice: [],
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

beforeEach(() => {
  mockCollect.mockReset();
  mockChance.mockReset();
  mockChance.mockReturnValue(24);
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
