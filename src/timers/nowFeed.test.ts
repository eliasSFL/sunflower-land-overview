import { describe, expect, it } from "vitest";

import { collectReady, upcomingWithin } from "./nowFeed.ts";
import type { AggregatedTimer } from "./types.ts";

const NOW = 1_000_000;
const MIN = 60_000;

// Minimal AggregatedTimer factory — only the fields nowFeed reads. Cast
// through unknown so the test doesn't have to spell out the full Timer
// shape it never touches.
function timer(partial: Partial<AggregatedTimer>): AggregatedTimer {
  return {
    id: "t",
    category: "Crops",
    label: "Sunflower",
    readyAt: NOW,
    count: 1,
    ...partial,
  } as unknown as AggregatedTimer;
}

describe("collectReady", () => {
  it("counts only ready, non-idle items and groups them by category", () => {
    const timers = [
      timer({ id: "a", category: "Crops", readyAt: NOW - MIN }),
      timer({ id: "b", category: "Crops", readyAt: NOW + MIN }), // not ready
      timer({ id: "c", category: "Animals", readyAt: NOW }), // ready (==now)
      timer({ id: "d", category: "Animals", idle: true, readyAt: NOW - MIN }),
    ];
    const { groups, total } = collectReady(timers, NOW);
    expect(total).toBe(2);
    expect(groups.map((g) => g.category)).toEqual(["Crops", "Animals"]);
    expect(groups[0].items.map((i) => i.key)).toEqual(["a"]);
    expect(groups[1].items.map((i) => i.key)).toEqual(["c"]);
  });

  it("treats each ready slot of a multi-slot timer as its own item", () => {
    const timers = [
      timer({
        id: "kitchen",
        category: "Kitchen",
        slots: [
          { item: "Soup", amount: 1, readyAt: NOW - MIN, icon: "soup.png" },
          { item: "Pie", amount: 2, readyAt: NOW + MIN, icon: "pie.png" },
        ],
      } as unknown as Partial<AggregatedTimer>),
    ];
    const { groups, total } = collectReady(timers, NOW);
    expect(total).toBe(1);
    expect(groups[0].items[0]).toMatchObject({ label: "Soup", amount: 1 });
  });

  it("returns no groups when nothing is ready", () => {
    const { groups, total } = collectReady(
      [timer({ readyAt: NOW + MIN })],
      NOW,
    );
    expect(total).toBe(0);
    expect(groups).toEqual([]);
  });
});

describe("upcomingWithin", () => {
  it("returns future items inside the window, sorted soonest-first", () => {
    const timers = [
      timer({ id: "soon", readyAt: NOW + 30 * MIN }),
      timer({ id: "later", readyAt: NOW + 10 * MIN }),
      timer({ id: "ready", readyAt: NOW - MIN }), // already ready → excluded
      timer({ id: "far", readyAt: NOW + 300 * MIN }), // beyond window
    ];
    const result = upcomingWithin(timers, NOW, 4 * 60 * MIN);
    expect(result.map((i) => i.key)).toEqual(["later", "soon"]);
  });

  it("skips idle timers", () => {
    const timers = [timer({ id: "idle", idle: true, readyAt: NOW + MIN })];
    expect(upcomingWithin(timers, NOW, 4 * 60 * MIN)).toEqual([]);
  });
});
