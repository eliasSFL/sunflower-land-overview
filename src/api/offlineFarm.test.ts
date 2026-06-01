import { describe, expect, it, vi } from "vitest";

// Identity-mock `makeGame` so the load test exercises the rebase/stamp glue
// without booting the real submodule game graph — matching the standalone
// vitest setup, which mocks `../game/index.ts` rather than resolving the
// submodule aliases (see vitest.config.ts). `shiftTimers` runs on the raw
// JSON before hydration anyway, so identity hydration is faithful here.
vi.mock("../game/index.ts", () => ({
  makeGame: <T>(farm: T): T => farm,
}));

import { OFFLINE_FARM_ID } from "./offlineFarm.ts";
import { loadOfflineFarm, shiftTimers } from "./offlineFarmData.ts";

// Mirrors the magnitude window in offlineFarmData.ts — a number in
// [TS_LO, NOW) after rebasing means a timer that's already due; one in
// [NOW, TS_HI) means a live countdown.
const TS_HI = 2_000_000_000_000;

function countNumbersInRange(value: unknown, lo: number, hi: number): number {
  if (typeof value === "number") return value >= lo && value < hi ? 1 : 0;
  if (Array.isArray(value)) {
    return value.reduce((n, v) => n + countNumbersInRange(v, lo, hi), 0);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce(
      (n: number, v) => n + countNumbersInRange(v, lo, hi),
      0,
    );
  }
  return 0;
}

describe("shiftTimers", () => {
  const DELTA = 1_000;

  it("shifts epoch-ms timestamps and leaves everything else untouched", () => {
    const out = shiftTimers(
      {
        plantedAt: 1_700_000_000_000, // in window → shifted
        level: 12, // small int → untouched
        coins: 5268.5, // small float → untouched
        vipExpiresAt: 32_501_520_000_000, // VIP sentinel, above window → untouched
        winnerId: 3_907_196_193_520_441, // farm id, above window → untouched
        name: "Sunflower", // string → untouched
        empty: null,
        nested: { minedAt: 1_750_000_000_000, coords: { x: -5, y: 3 } },
        readyAts: [1_650_000_000_000, 7],
      },
      DELTA,
    );

    expect(out.plantedAt).toBe(1_700_000_000_000 + DELTA);
    expect(out.level).toBe(12);
    expect(out.coins).toBe(5268.5);
    expect(out.vipExpiresAt).toBe(32_501_520_000_000);
    expect(out.winnerId).toBe(3_907_196_193_520_441);
    expect(out.name).toBe("Sunflower");
    expect(out.empty).toBeNull();
    expect(out.nested.minedAt).toBe(1_750_000_000_000 + DELTA);
    expect(out.nested.coords).toEqual({ x: -5, y: 3 });
    expect(out.readyAts).toEqual([1_650_000_000_000 + DELTA, 7]);
  });

  it("does not mutate its input", () => {
    const input = { plantedAt: 1_700_000_000_000, nested: { minedAt: 1 } };
    shiftTimers(input, DELTA);
    expect(input.plantedAt).toBe(1_700_000_000_000);
  });
});

describe("loadOfflineFarm", () => {
  // A fixed, far-future "now" so assertions don't depend on the wall clock
  // (and stay well under the rebase upper bound for years).
  const NOW = 1_900_000_000_000; // 2030-03-17

  it("loads the snapshot and stamps it to `now`", async () => {
    const resp = await loadOfflineFarm(NOW);

    expect(resp.id).toBe(Number(OFFLINE_FARM_ID));
    expect(resp.updatedAt).toBe(new Date(NOW).toISOString());
    expect(resp.farm).toBeDefined();
  });

  it("rebases the snapshot's timers so the farm still has live countdowns", async () => {
    const resp = await loadOfflineFarm(NOW);

    // After rebasing to `now`, the work that was in progress at capture
    // must land in the future (readyAt > now) rather than every timer
    // reading "ready". This is the point of the rebase and the canary for
    // the committed snapshot going stale.
    const live = countNumbersInRange(resp.farm, NOW, TS_HI);
    expect(live).toBeGreaterThan(0);
  });
});
