import { describe, expect, it, vi } from "vitest";

// Mock the upstream re-export boundary (same pattern as the other timer
// tests): vitest's node env doesn't resolve the submodule's `features/*`
// aliases. What's under test is that every animal building is read — the
// Pigpen included — not upstream's drop tables or boost maths, so the drop
// table is a flat stand-in and the drop amount is passed straight through.
vi.mock("../game/index.ts", () => ({
  ANIMAL_BUILDING_KEYS: ["henHouse", "barn", "pigpen"],
  ANIMAL_RESOURCE_DROP: {
    Chicken: { 1: { Egg: { toNumber: () => 1 } } },
    Pig: { 1: { Truffle: { toNumber: () => 1 } } },
  },
  getAnimalLevel: vi.fn(() => 1),
  getAnimalReadyAt: vi.fn((animal: { awakeAt: number }) => animal.awakeAt),
  getBoostIcon: vi.fn(),
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
  getKeys: (obj: object) => Object.keys(obj),
  getResourceDropAmount: vi.fn(({ baseAmount }: { baseAmount: number }) => ({
    amount: baseAmount,
    boostsUsed: [],
  })),
}));

// NODE_LABEL lives in resources.ts, which builds its table from upstream
// at import time; stub the two entries this test reads.
vi.mock("./resources.ts", () => ({
  NODE_LABEL: { Egg: "Chicken", Truffle: "Pig" },
}));

import type { GameState } from "../game/index.ts";
import { extractAnimalTimers, iterAnimals } from "./animals.ts";
import type { TimerContext } from "./types.ts";

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

const ctx: TimerContext = {
  farmId: 1,
  now: NOW,
  counter: { next: () => 0 },
};

function animal(id: string, type: string) {
  return {
    id,
    type,
    state: "ready",
    experience: 100,
    awakeAt: NOW - 1000,
    asleepAt: 0,
  };
}

// The extractor only reads the animal building slices; the cast keeps the
// fixture small.
function stateWith(slices: Record<string, unknown>): GameState {
  return slices as unknown as GameState;
}

describe("iterAnimals", () => {
  it("reads the hen house, barn and pigpen", () => {
    const state = stateWith({
      henHouse: { level: 1, animals: { a: animal("a", "Chicken") } },
      barn: { level: 1, animals: {} },
      pigpen: { level: 1, animals: { p: animal("p", "Pig") } },
    });

    expect([...iterAnimals(state)].map((a) => a.id)).toEqual(["a", "p"]);
  });

  it("tolerates a payload with no pigpen at all", () => {
    const state = stateWith({
      henHouse: { level: 1, animals: { a: animal("a", "Chicken") } },
    });

    expect([...iterAnimals(state)].map((a) => a.id)).toEqual(["a"]);
  });
});

describe("extractAnimalTimers", () => {
  it("emits a Truffle card for each Pig", () => {
    const state = stateWith({
      pigpen: {
        level: 1,
        animals: { p1: animal("p1", "Pig"), p2: animal("p2", "Pig") },
      },
    });

    const timers = extractAnimalTimers(state, ctx);
    expect(timers).toHaveLength(2);
    expect(timers[0]).toMatchObject({
      category: "Animals",
      label: "Truffle",
      icon: "icon:Truffle",
      predictedYield: { amount: 1, item: "Truffle" },
      subtext: "Pig",
      nodeLabel: "Pig",
      aggregationKey: "Animals|Pig|Truffle",
    });
  });
});
