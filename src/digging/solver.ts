// Sand/crab deduction for Digby's dig site — "Minesweeper" for digging.
//
// The game itself has no solver: `state.desert.digging.grid` is just a
// sparse list of revealed holes. This overlay is entirely overview-side
// reasoning about those clues; it never reveals anything the board
// doesn't already prove. Kept pure (no React, no game-state slice beyond
// the hole list) so it can be unit-tested in isolation.

import type { DugHole, InventoryItemName } from "../game/index.ts";

export const DIG_GRID = 10;

export type DiggingStatus =
  // Undug tiles, coloured by deduction:
  | "unknown" // no adjacent clue yet — nothing provable
  | "empty" // a Sand borders it → provably no treasure (red)
  | "possible" // a Crab borders it → might hide treasure (yellow)
  | "guaranteed" // the only tile that can satisfy a Crab → certain dig (green)
  // Dug tiles:
  | "treasure" // a treasure already dug up (green)
  | "clue-sand" // revealed Sand indicator
  | "clue-crab"; // revealed Crab indicator

export type DiggingKind = "sand" | "crab" | "treasure" | null;

export type DiggingCell = {
  x: number;
  y: number;
  // The revealed item at this hole, or null while the tile is still undug.
  item: InventoryItemName | null;
  dug: boolean;
  kind: DiggingKind;
  status: DiggingStatus;
  // Set by the formation pass (formationSolver) when an undug tile's
  // treasure is *proven* by completing a known formation — the item it
  // must hold and the formation it completes.
  predicted?: { item: InventoryItemName; formation: string };
};

export type DiggingTally = {
  guaranteed: number;
  possible: number;
  empty: number;
  dug: number;
  crabs: number;
  sand: number;
};

export type SolvedBoard = {
  cells: DiggingCell[][];
  tally: DiggingTally;
};

// 4 cardinal directions — the only neighbours sand/crab clues speak to.
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function neighbours(x: number, y: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRECTIONS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < DIG_GRID && ny >= 0 && ny < DIG_GRID) {
      out.push([nx, ny]);
    }
  }
  return out;
}

// The revealed item of a hole is the first (and only) key of its `items`
// record. Returns null for an undug tile. Read with a plain `Object.keys`
// + cast rather than the upstream `getKeys` so this unit-tested module
// stays free of the game/index value barrel (which pulls submodule paths
// vitest can't resolve).
function holeItem(hole: DugHole | undefined): InventoryItemName | null {
  if (!hole) return null;
  return (Object.keys(hole.items)[0] as InventoryItemName | undefined) ?? null;
}

// Reconstruct a dense DIG_GRID×DIG_GRID matrix from the sparse hole list.
// Each grid entry is either a single hole or a group dug at once (Sand
// Drill); both flatten to per-coordinate holes. Out-of-range coordinates
// are ignored defensively. `hole.x` is the column, `hole.y` the row —
// matching how the game snaps holes to the site grid.
export function buildHoleGrid(
  grid: ReadonlyArray<DugHole | DugHole[]>,
): Array<Array<DugHole | undefined>> {
  const board: Array<Array<DugHole | undefined>> = Array.from(
    { length: DIG_GRID },
    () => Array<DugHole | undefined>(DIG_GRID).fill(undefined),
  );
  for (const entry of grid) {
    const holes = Array.isArray(entry) ? entry : [entry];
    for (const hole of holes) {
      if (
        hole.y >= 0 &&
        hole.y < DIG_GRID &&
        hole.x >= 0 &&
        hole.x < DIG_GRID
      ) {
        board[hole.y][hole.x] = hole;
      }
    }
  }
  return board;
}

// Run the deduction over a dug-hole grid. Rules (from the dig mechanic):
//   • Sand → none of its 4 cardinal neighbours hide treasure
//   • Crab → at least one of its 4 cardinal neighbours hides treasure
//   • any other revealed item = a treasure already dug up
export function solveDiggingGrid(
  grid: ReadonlyArray<DugHole | DugHole[]>,
): SolvedBoard {
  const holes = buildHoleGrid(grid);
  const cells: DiggingCell[][] = [];

  // Base pass: classify every tile from its revealed item.
  for (let y = 0; y < DIG_GRID; y++) {
    cells[y] = [];
    for (let x = 0; x < DIG_GRID; x++) {
      const item = holeItem(holes[y][x]);
      const dug = item !== null;
      let kind: DiggingKind = null;
      if (item === "Sand") kind = "sand";
      else if (item === "Crab") kind = "crab";
      else if (dug) kind = "treasure";
      cells[y][x] = { x, y, item, dug, kind, status: "unknown" };
    }
  }

  // Status pass: dug tiles read their clue; undug tiles look at their
  // neighbours (a bordering Sand wins — it's a hard "no treasure").
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const cell = cells[y][x];
      if (cell.dug) {
        cell.status =
          cell.kind === "treasure"
            ? "treasure"
            : cell.kind === "sand"
              ? "clue-sand"
              : "clue-crab";
        continue;
      }
      let hasSand = false;
      let hasCrab = false;
      for (const [nx, ny] of neighbours(x, y)) {
        const k = cells[ny][nx].kind;
        if (k === "sand") hasSand = true;
        if (k === "crab") hasCrab = true;
      }
      cell.status = hasSand ? "empty" : hasCrab ? "possible" : "unknown";
    }
  }

  // Propagation: an unsatisfied crab (no treasure revealed beside it yet)
  // with exactly one non-empty undug neighbour forces that neighbour to
  // be a guaranteed treasure — the only place its required treasure can
  // hide.
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const crab = cells[y][x];
      if (crab.kind !== "crab") continue;
      const ns = neighbours(x, y).map(([nx, ny]) => cells[ny][nx]);
      const satisfied = ns.some((n) => n.kind === "treasure");
      if (satisfied) continue;
      const candidates = ns.filter((n) => !n.dug && n.status !== "empty");
      if (candidates.length === 1 && candidates[0].status !== "guaranteed") {
        candidates[0].status = "guaranteed";
      }
    }
  }

  // Tally by final status.
  const tally: DiggingTally = {
    guaranteed: 0,
    possible: 0,
    empty: 0,
    dug: 0,
    crabs: 0,
    sand: 0,
  };
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const c = cells[y][x];
      if (c.dug) tally.dug++;
      if (c.kind === "crab") tally.crabs++;
      if (c.kind === "sand") tally.sand++;
      if (c.status === "guaranteed") tally.guaranteed++;
      else if (c.status === "possible") tally.possible++;
      else if (c.status === "empty") tally.empty++;
    }
  }

  return { cells, tally };
}
