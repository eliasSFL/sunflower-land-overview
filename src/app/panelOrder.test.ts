import { describe, expect, it } from "vitest";

import type { PanelDescriptor } from "./panelRegistry.tsx";
import {
  isArrangement,
  mergeOrder,
  resolveArrangement,
  sortByArrangement,
  spliceVisibleOrder,
} from "./panelOrder.ts";

// Minimal descriptor — render is never invoked by the pure resolver.
function panel(id: string, pinned = false): PanelDescriptor {
  return { id, label: id, icon: `icon:${id}`, pinned, render: () => null };
}

describe("mergeOrder", () => {
  it("returns live ids in default order when nothing is saved", () => {
    expect(mergeOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("honours the saved order for known ids", () => {
    expect(mergeOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("splices a new live id in after its default predecessor", () => {
    // Saved order knew a, c; b is newly live and sits after a by default.
    expect(mergeOrder(["a", "c"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("appends a new leading id at the front when it has no predecessor", () => {
    expect(mergeOrder(["b", "c"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("retains saved ids that are no longer live (off-season categories)", () => {
    expect(mergeOrder(["a", "gone", "b"], ["a", "b"])).toEqual([
      "a",
      "gone",
      "b",
    ]);
  });
});

describe("resolveArrangement", () => {
  const live = [panel("install", true), panel("a"), panel("b"), panel("c")];

  it("pins first, then visible arrangeable in resolved order", () => {
    const { renderPanels } = resolveArrangement(
      { order: ["c", "a", "b"], hidden: [] },
      live,
    );
    expect(renderPanels.map((p) => p.id)).toEqual(["install", "c", "a", "b"]);
  });

  it("drops hidden panels from render but keeps them in items", () => {
    const { renderPanels, items } = resolveArrangement(
      { order: [], hidden: ["b"] },
      live,
    );
    expect(renderPanels.map((p) => p.id)).toEqual(["install", "a", "c"]);
    expect(items.find((i) => i.id === "b")).toMatchObject({ hidden: true });
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores saved ids that aren't currently live", () => {
    const { orderedLiveIds } = resolveArrangement(
      { order: ["gone", "b", "a"], hidden: [] },
      live,
    );
    // `gone` is dropped; new `c` slots in after its default predecessor b.
    expect(orderedLiveIds).toEqual(["b", "c", "a"]);
  });
});

describe("isArrangement", () => {
  it("accepts a well-formed arrangement", () => {
    expect(isArrangement({ order: ["a"], hidden: [] })).toBe(true);
    expect(isArrangement({ order: [], hidden: [] })).toBe(true);
  });

  it("rejects corrupt/legacy payloads", () => {
    expect(isArrangement(null)).toBe(false);
    expect(isArrangement("nope")).toBe(false);
    expect(isArrangement({})).toBe(false);
    // Missing either field.
    expect(isArrangement({ hidden: [] })).toBe(false);
    expect(isArrangement({ order: [] })).toBe(false);
    // Bad `order`.
    expect(isArrangement({ order: "a", hidden: [] })).toBe(false);
    expect(isArrangement({ order: [1], hidden: [] })).toBe(false);
    // Bad `hidden`.
    expect(isArrangement({ order: [], hidden: "bad" })).toBe(false);
    expect(isArrangement({ order: [], hidden: [1] })).toBe(false);
  });
});

describe("spliceVisibleOrder", () => {
  it("refills visible slots while pinning hidden ids in place", () => {
    // Order a,b,c,d with b hidden. Drag visible [a,c,d] -> [d,a,c].
    expect(
      spliceVisibleOrder(["a", "b", "c", "d"], ["b"], ["d", "a", "c"]),
    ).toEqual(["d", "b", "a", "c"]);
  });
});

describe("sortByArrangement", () => {
  it("keeps unranked chips first, then orders the rest by arrangement", () => {
    const sections = [
      { id: "ready" },
      { id: "idle" },
      { id: "x" },
      { id: "y" },
    ];
    expect(
      sortByArrangement(sections, ["y", "x", "idle"]).map((s) => s.id),
    ).toEqual(["ready", "y", "x", "idle"]);
  });

  it("keeps chips sharing a panelId contiguous (Deliveries group)", () => {
    const sections = [
      { id: "coins", panelId: "deliveries" },
      { id: "flower", panelId: "deliveries" },
      { id: "tickets", panelId: "deliveries" },
      { id: "pets" },
    ];
    expect(
      sortByArrangement(sections, ["pets", "deliveries"]).map((s) => s.id),
    ).toEqual(["pets", "coins", "flower", "tickets"]);
  });
});
