import { describe, expect, it } from "vitest";

import type { DugHole, InventoryItemName } from "../game/index.ts";
import {
  DIG_GRID,
  buildHoleGrid,
  solveDiggingGrid,
  type DiggingCell,
} from "./solver.ts";

// Build a single revealed hole. `dugAt`/`tool` are irrelevant to the
// solver, so we stamp fixed placeholders.
function hole(x: number, y: number, item: InventoryItemName): DugHole {
  return { x, y, dugAt: 0, items: { [item]: 1 }, tool: "Sand Shovel" };
}

function cellAt(
  board: ReturnType<typeof solveDiggingGrid>,
  x: number,
  y: number,
): DiggingCell {
  return board.cells[y][x];
}

describe("buildHoleGrid", () => {
  it("places holes at [y][x] using column=x, row=y", () => {
    const grid = buildHoleGrid([hole(3, 1, "Crab")]);
    expect(grid[1][3]?.items).toEqual({ Crab: 1 });
    expect(grid[3][1]).toBeUndefined();
  });

  it("flattens groups dug in one action", () => {
    const grid = buildHoleGrid([[hole(0, 0, "Sand"), hole(1, 0, "Sand")]]);
    expect(grid[0][0]).toBeDefined();
    expect(grid[0][1]).toBeDefined();
  });

  it("ignores out-of-range coordinates defensively", () => {
    expect(() => buildHoleGrid([hole(99, 99, "Sand")])).not.toThrow();
  });
});

describe("solveDiggingGrid", () => {
  it("returns a fully unknown board for an empty grid", () => {
    const solved = solveDiggingGrid([]);
    expect(solved.cells).toHaveLength(DIG_GRID);
    expect(solved.cells[0]).toHaveLength(DIG_GRID);
    expect(solved.tally.dug).toBe(0);
    expect(cellAt(solved, 5, 5).status).toBe("unknown");
  });

  it("classifies revealed clues and treasures", () => {
    const solved = solveDiggingGrid([
      hole(0, 0, "Sand"),
      hole(2, 0, "Crab"),
      hole(4, 0, "Camel Bone"),
    ]);
    expect(cellAt(solved, 0, 0).status).toBe("clue-sand");
    expect(cellAt(solved, 2, 0).status).toBe("clue-crab");
    expect(cellAt(solved, 4, 0)).toMatchObject({
      status: "treasure",
      kind: "treasure",
      item: "Camel Bone",
    });
    expect(solved.tally).toMatchObject({ dug: 3, sand: 1, crabs: 1 });
  });

  it("marks Sand's undug neighbours as provably empty", () => {
    const solved = solveDiggingGrid([hole(1, 1, "Sand")]);
    expect(cellAt(solved, 1, 0).status).toBe("empty"); // above
    expect(cellAt(solved, 1, 2).status).toBe("empty"); // below
    expect(cellAt(solved, 0, 1).status).toBe("empty"); // left
    expect(cellAt(solved, 2, 1).status).toBe("empty"); // right
    expect(cellAt(solved, 3, 3).status).toBe("unknown"); // far away
  });

  it("marks a Crab's undug neighbours as possible", () => {
    const solved = solveDiggingGrid([hole(5, 5, "Crab")]);
    expect(cellAt(solved, 5, 4).status).toBe("possible");
    expect(cellAt(solved, 5, 6).status).toBe("possible");
    expect(solved.tally.possible).toBe(4);
  });

  it("lets a bordering Sand override a Crab (empty wins)", () => {
    // Tile (1,0) borders both the Crab at (0,0) and the Sand at (2,0).
    const solved = solveDiggingGrid([hole(0, 0, "Crab"), hole(2, 0, "Sand")]);
    expect(cellAt(solved, 1, 0).status).toBe("empty");
  });

  it("forces a guaranteed dig when a crab has one viable neighbour", () => {
    // Edge crab at (0,5) has three neighbours: (0,4), (0,6), (1,5).
    // Sands clear two of them, so the crab's required treasure must be in
    // the sole remaining undug, non-empty neighbour: (0,6).
    const solved = solveDiggingGrid([
      hole(0, 5, "Crab"),
      hole(0, 3, "Sand"), // its neighbour (0,4) becomes empty
      hole(2, 5, "Sand"), // its neighbour (1,5) becomes empty
    ]);
    expect(cellAt(solved, 0, 4).status).toBe("empty");
    expect(cellAt(solved, 1, 5).status).toBe("empty");
    expect(cellAt(solved, 0, 6).status).toBe("guaranteed");
    expect(solved.tally.guaranteed).toBe(1);
  });

  it("does not force a dig when a crab is already satisfied", () => {
    // Crab next to a revealed treasure needs no further deduction.
    const solved = solveDiggingGrid([
      hole(0, 5, "Crab"),
      hole(1, 5, "Camel Bone"), // satisfies the crab
      hole(0, 3, "Sand"), // clears (0,4)
    ]);
    expect(cellAt(solved, 0, 6).status).not.toBe("guaranteed");
    expect(solved.tally.guaranteed).toBe(0);
  });
});
