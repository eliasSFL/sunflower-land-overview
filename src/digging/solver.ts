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
  | "crab" // provably no treasure, yet borders one → must reveal a Crab
  | "sand" // provably no treasure and beside none → must reveal a Sand
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
  // Undug tiles the prediction pass proved will reveal a Crab / Sand when
  // dug (see markPredictions).
  crabPredicted: number;
  sandPredicted: number;
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
    crabPredicted: 0,
    sandPredicted: 0,
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

// Predict the hidden item of every undug tile we've proven treasure-free. The
// dig mechanic hands a Crab to a treasure-free tile with at least one treasure
// on its 4 sides, and a Sand to one with none — so a tile proven to hold no
// treasure splits three ways:
//   • borders a *proven* treasure          → it can only reveal a Crab,
//   • borders *no* tile that could be one   → it can only reveal a Sand,
//   • borders a still-*possible* treasure   → crab-vs-sand stays undetermined,
//     so we leave it as the safe "no treasure" tile it already is.
// This is the sound, provable form of "next to a treasure is a crab, away from
// every treasure is sand" — we never touch a tile we can't yet rule out as a
// treasure, since formations let treasures sit side by side (e.g. the 2×2 Old
// Bottle).
//
// A tile is proven treasure-free two ways:
//   • status "empty" — a Sand borders it (zero adjacent treasures), or
//   • its key is in `excludedTreasure` — the formation enumeration proved no
//     valid layout can place a treasure there.
// A "proven treasure" neighbour is a revealed treasure (`kind === "treasure"`)
// or an undug tile the earlier passes already forced (`status === "guaranteed"`
// — either crab-satisfaction or a formation-forced tile). A neighbour can
// *still* hide a treasure unless it's settled treasure-free (a revealed
// Sand/Crab clue, or itself proven empty/excluded). So this must run last,
// after `solveDiggingGrid` and `applyForcedTiles`. Pure, like the rest.
export function markPredictions(
  solved: SolvedBoard,
  excludedTreasure: ReadonlySet<number> = new Set(),
): SolvedBoard {
  const cells = solved.cells.map((row) => row.slice());
  // Read treasure-freeness from the *input* board: relabelling a tile rewrites
  // its status, so deriving a neighbour's verdict from the mutated copy would
  // make the pass order-dependent. This snapshot keeps it sound.
  const treasureFree = solved.cells.map((row) =>
    row.map(
      (c) => c.status === "empty" || excludedTreasure.has(c.y * DIG_GRID + c.x),
    ),
  );
  // Whether an undug neighbour might still turn out to be a treasure.
  const canHoldTreasure = (n: DiggingCell): boolean => {
    if (n.dug) return n.kind === "treasure";
    if (n.status === "guaranteed") return true; // a forced treasure
    return !treasureFree[n.y][n.x];
  };
  let changed = false;
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const cell = cells[y][x];
      // Skip revealed tiles and tiles already proven to hold a treasure.
      if (cell.dug || cell.status === "guaranteed") continue;
      if (!treasureFree[y][x]) continue;
      const ns = neighbours(x, y).map(([nx, ny]) => solved.cells[ny][nx]);
      if (ns.some((n) => n.kind === "treasure" || n.status === "guaranteed")) {
        // Treasure-free yet beside a proven treasure → digs up a Crab.
        cells[y][x] = { ...cell, status: "crab" };
        changed = true;
      } else if (ns.every((n) => !canHoldTreasure(n))) {
        // Treasure-free with no treasure it could ever border → digs up Sand.
        cells[y][x] = { ...cell, status: "sand" };
        changed = true;
      }
    }
  }
  if (!changed) return solved;

  // Recompute the counts the relabel can move (a crab or sand can come from an
  // empty, possible, or unknown tile); the rest are untouched.
  const tally = {
    ...solved.tally,
    possible: 0,
    empty: 0,
    crabPredicted: 0,
    sandPredicted: 0,
  };
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const s = cells[y][x].status;
      if (s === "possible") tally.possible++;
      else if (s === "empty") tally.empty++;
      else if (s === "crab") tally.crabPredicted++;
      else if (s === "sand") tally.sandPredicted++;
    }
  }
  return { cells, tally };
}
