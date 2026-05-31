import { describe, expect, it } from "vitest";

import type { InventoryItemName } from "../game/index.ts";
import { DIG_GRID, type DiggingCell } from "./solver.ts";
import {
  solveFormations,
  applyForcedTiles,
  type ResolvedFormation,
} from "./formationSolver.ts";

// A blank board: every tile undug and unknown.
function blankCells(): DiggingCell[][] {
  return Array.from({ length: DIG_GRID }, (_, y) =>
    Array.from(
      { length: DIG_GRID },
      (_unused, x): DiggingCell => ({
        x,
        y,
        item: null,
        dug: false,
        kind: null,
        status: "unknown",
      }),
    ),
  );
}

function reveal(
  cells: DiggingCell[][],
  x: number,
  y: number,
  item: InventoryItemName,
): void {
  cells[y][x] = {
    x,
    y,
    item,
    dug: true,
    kind: item === "Sand" ? "sand" : item === "Crab" ? "crab" : "treasure",
    status:
      item === "Sand"
        ? "clue-sand"
        : item === "Crab"
          ? "clue-crab"
          : "treasure",
  };
}

// Mark every undug tile NOT in `open` as proven-empty, pinning where a
// formation can sit.
function sealExcept(
  cells: DiggingCell[][],
  open: Array<[number, number]>,
): void {
  const keep = new Set(open.map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      if (!cells[y][x].dug && !keep.has(`${x},${y}`))
        cells[y][x].status = "empty";
    }
  }
}

const SEA_CUCUMBERS: ResolvedFormation = {
  name: "SEA_CUCUMBERS",
  plots: [
    { dx: 0, dy: 0, item: "Sea Cucumber" },
    { dx: 1, dy: 0, item: "Sea Cucumber" },
    { dx: 2, dy: 0, item: "Sea Cucumber" },
    { dx: 3, dy: 0, item: "Pipi" },
  ],
};

function itemAt(
  forced: ReturnType<typeof solveFormations>,
  x: number,
  y: number,
) {
  return forced.find((f) => f.x === x && f.y === y)?.item;
}

describe("solveFormations", () => {
  it("forces both gaps when coverage pins the placement", () => {
    // E9 cucumber + G9 Pipi revealed (the real-board case). The lone Sea
    // Cucumbers instance must cover both, which only the D9 placement does —
    // so the two undug cucumbers (D9, F9) are forced.
    const cells = blankCells();
    reveal(cells, 4, 8, "Sea Cucumber"); // E9
    reveal(cells, 6, 8, "Pipi"); // G9
    const forced = solveFormations(cells, [SEA_CUCUMBERS]);
    expect(forced).toEqual(
      expect.arrayContaining([
        { x: 3, y: 8, item: "Sea Cucumber", formation: "SEA_CUCUMBERS" },
        { x: 5, y: 8, item: "Sea Cucumber", formation: "SEA_CUCUMBERS" },
      ]),
    );
    expect(forced).toHaveLength(2);
  });

  it("does not force when the placement is still ambiguous", () => {
    // A single revealed cucumber could be the 1st/2nd/3rd of its row, so
    // nothing is pinned.
    const cells = blankCells();
    reveal(cells, 4, 8, "Sea Cucumber");
    expect(solveFormations(cells, [SEA_CUCUMBERS])).toEqual([]);
  });

  it("forces a formation that fits exactly one spot", () => {
    // Walls leave one slot, so the pair is pinned even with nothing revealed.
    const cells = blankCells();
    const PAIR: ResolvedFormation = {
      name: "PAIR",
      plots: [
        { dx: 0, dy: 0, item: "Pearl" },
        { dx: 1, dy: 0, item: "Coral" },
      ],
    };
    sealExcept(cells, [
      [0, 0],
      [1, 0],
    ]);
    const forced = solveFormations(cells, [PAIR]);
    expect(forced).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, item: "Pearl", formation: "PAIR" },
        { x: 1, y: 0, item: "Coral", formation: "PAIR" },
      ]),
    );
    expect(forced).toHaveLength(2);
  });

  it("resolves two non-overlapping instances into an exact fit", () => {
    // Two Sea Cucumbers instances, eight open tiles: the only layout is
    // [cucumbers|Pipi] twice, forcing all eight.
    const cells = blankCells();
    sealExcept(
      cells,
      Array.from({ length: 8 }, (_, x): [number, number] => [x, 0]),
    );
    const forced = solveFormations(cells, [SEA_CUCUMBERS, SEA_CUCUMBERS]);
    expect(forced).toHaveLength(8);
    expect(itemAt(forced, 3, 0)).toBe("Pipi");
    expect(itemAt(forced, 7, 0)).toBe("Pipi");
    expect(itemAt(forced, 0, 0)).toBe("Sea Cucumber");
    expect(itemAt(forced, 4, 0)).toBe("Sea Cucumber");
  });

  it("does not force across a shared-item ambiguity", () => {
    // A revealed Camel Bone could anchor either formation, so its neighbours
    // stay unproven.
    const cells = blankCells();
    reveal(cells, 3, 3, "Camel Bone");
    const shared: ResolvedFormation[] = [
      {
        name: "F1",
        plots: [
          { dx: 0, dy: 0, item: "Camel Bone" },
          { dx: 1, dy: 0, item: "Cow Skull" },
        ],
      },
      {
        name: "F2",
        plots: [
          { dx: 0, dy: 0, item: "Camel Bone" },
          { dx: 0, dy: 1, item: "Cow Skull" },
        ],
      },
    ];
    expect(solveFormations(cells, shared)).toEqual([]);
  });

  it("ignores tiles the crab pass already proved empty", () => {
    // E9 cucumber + G9 Pipi, but F9 proven empty → no consistent placement.
    const cells = blankCells();
    reveal(cells, 4, 8, "Sea Cucumber");
    reveal(cells, 6, 8, "Pipi");
    cells[8][5].status = "empty"; // F9
    expect(solveFormations(cells, [SEA_CUCUMBERS])).toEqual([]);
  });
});

describe("applyForcedTiles", () => {
  it("returns the same board reference when nothing is forced", () => {
    const solved = { cells: blankCells(), tally: emptyTally() };
    expect(applyForcedTiles(solved, [])).toBe(solved);
  });

  it("upgrades a forced tile to a predicted guaranteed dig", () => {
    const solved = { cells: blankCells(), tally: emptyTally() };
    const enhanced = applyForcedTiles(solved, [
      { x: 3, y: 8, item: "Pipi", formation: "SEA_CUCUMBERS" },
    ]);
    expect(enhanced.cells[8][3]).toMatchObject({
      status: "guaranteed",
      predicted: { item: "Pipi", formation: "SEA_CUCUMBERS" },
    });
    expect(enhanced.tally.guaranteed).toBe(1);
    expect(solved.cells[8][3].status).toBe("unknown");
  });
});

function emptyTally() {
  return {
    guaranteed: 0,
    possible: 0,
    empty: 0,
    dug: 0,
    crabs: 0,
    sand: 0,
  };
}
