import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream re-export boundary (same pattern as the other timer
// tests): vitest's node env doesn't resolve the submodule's `features/*`
// aliases. `isCavePatchCleared` keeps upstream's rule (every tile dug) so
// the fixtures read naturally; the building gate is controlled per test.
vi.mock("../game/index.ts", () => ({
  BEETLES: ["Green Beetle", "Blue Beetle", "Pink Beetle", "Amber Beetle"],
  CAVE_PATCH_TILE_COUNT: 25,
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
  isCaveBuildingReady: vi.fn(),
  isCavePatchCleared: vi.fn(
    (batch: { dug?: Record<string, unknown> }) =>
      Object.keys(batch.dug ?? {}).length >= 25,
  ),
}));

import { isCaveBuildingReady, type GameState } from "../game/index.ts";
import { extractCaveTimers } from "./cave.ts";
import type { TimerContext } from "./types.ts";

const mockBuildingReady = vi.mocked(isCaveBuildingReady);

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const ctx: TimerContext = {
  farmId: 1,
  now: NOW,
  counter: { next: () => 0 },
};

function dugTiles(count: number): Record<string, { dugAt: number }> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${i % 5},${Math.floor(i / 5)}`,
      { dugAt: NOW - HOUR },
    ]),
  );
}

// The extractor only reads `state.cave`; the cast keeps the fixture small.
function stateWith(
  machines: Record<string, unknown> | undefined,
  construction?: { tier: number; startedAt: number; readyAt: number },
): GameState {
  return {
    cave: machines && { builtAt: 0, tier: 1, machines, construction },
  } as unknown as GameState;
}

beforeEach(() => {
  mockBuildingReady.mockReset();
  mockBuildingReady.mockReturnValue(true);
});

describe("extractCaveTimers", () => {
  it("emits nothing for a farm without a Cave", () => {
    expect(extractCaveTimers(stateWith(undefined), ctx)).toEqual([]);
  });

  it("emits nothing while the Cave building isn't built", () => {
    mockBuildingReady.mockReturnValue(false);
    const state = stateWith({ "1": {} });

    expect(extractCaveTimers(state, ctx)).toEqual([]);
  });

  it("counts a growing batch down to its stored readyAt", () => {
    const state = stateWith({
      "1": {
        batch: {
          recipe: "Mushroom",
          startedAt: NOW - HOUR,
          readyAt: NOW + 11 * HOUR,
        },
      },
    });

    const [timer] = extractCaveTimers(state, ctx);
    expect(timer).toMatchObject({
      id: "cave-1",
      category: "Cave",
      label: "Mushroom patch",
      icon: "icon:Wild Mushroom",
      readyAt: NOW + 11 * HOUR,
      subtext: "Myco Bin 1",
      pushTitle: "Mushroom patch ready to dig",
    });
    expect(timer.idle).toBeUndefined();
  });

  it("shows dig progress on a ready patch", () => {
    const state = stateWith({
      "1": {
        batch: {
          recipe: "Beetle",
          startedAt: NOW - 13 * HOUR,
          readyAt: NOW - HOUR,
          dug: dugTiles(12),
        },
      },
    });

    const [timer] = extractCaveTimers(state, ctx);
    expect(timer).toMatchObject({
      label: "Beetle patch",
      icon: "icon:Green Beetle",
      readyAt: NOW - HOUR,
      subtext: "Myco Bin 1 · 12/25 dug",
    });
  });

  it("marks empty and fully dug machines idle", () => {
    const state = stateWith({
      "1": {},
      "2": {
        batch: {
          recipe: "Mud",
          startedAt: NOW - 13 * HOUR,
          readyAt: NOW - HOUR,
          dug: dugTiles(25),
        },
      },
    });

    const timers = extractCaveTimers(state, ctx);
    expect(timers.map((t) => [t.label, t.idle, t.idleText])).toEqual([
      ["Myco Bin 1", true, "Empty"],
      ["Myco Bin 2", true, "Patch cleared"],
    ]);
  });

  it("orders machines by tier and keeps one card each", () => {
    const state = stateWith({ "10": {}, "2": {}, "1": {} });

    const timers = extractCaveTimers(state, ctx);
    expect(timers.map((t) => t.aggregationKey)).toEqual([
      "Cave|1",
      "Cave|2",
      "Cave|10",
    ]);
  });

  it("counts a tier expansion down to its stored readyAt", () => {
    const state = stateWith(
      { "1": {} },
      { tier: 2, startedAt: NOW - HOUR, readyAt: NOW + 3 * HOUR },
    );

    const timers = extractCaveTimers(state, ctx);
    expect(timers.map((t) => t.id)).toEqual(["cave-expansion", "cave-1"]);
    expect(timers[0]).toMatchObject({
      category: "Cave",
      label: "Cave Tier 2",
      icon: "icon:Cave",
      readyAt: NOW + 3 * HOUR,
      subtext: "Expanding · adds Myco Bin 2",
      pushTitle: "Cave Tier 2 built",
      aggregationKey: "Cave|expansion",
    });
    expect(timers[0].idle).toBeUndefined();
  });

  it("keeps a built expansion ready until it's completed", () => {
    const state = stateWith(
      { "1": {}, "2": {} },
      { tier: 3, startedAt: NOW - 9 * HOUR, readyAt: NOW - HOUR },
    );

    const [timer] = extractCaveTimers(state, ctx);
    expect(timer).toMatchObject({
      label: "Cave Tier 3",
      readyAt: NOW - HOUR,
      subtext: "Complete it to add Myco Bin 3",
    });
  });

  it("shows no expansion while the Cave building isn't built", () => {
    mockBuildingReady.mockReturnValue(false);
    const state = stateWith(
      { "1": {} },
      { tier: 2, startedAt: NOW - HOUR, readyAt: NOW + 3 * HOUR },
    );

    expect(extractCaveTimers(state, ctx)).toEqual([]);
  });
});
