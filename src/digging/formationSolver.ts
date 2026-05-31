// Proven-only formation deduction — a second pass on top of the sand/crab
// solver. Where the crab logic proves "a treasure is here", this proves
// *which* treasure, by reasoning about how today's formations can possibly
// be laid out on the board.
//
// Soundness rests on the game's model (see `getTreasureCount` upstream):
// every treasure on the site belongs to exactly one of today's `patterns`
// — there are no "loose" treasures, and formations don't overlap. So the
// true board is one valid way to place every formation instance over the
// revealed treasures. We enumerate ALL such arrangements (an exact cover);
// an undug tile is forced only when every arrangement agrees on its item.
//
// The search is bounded (MAX_SOLUTIONS / MAX_STEPS). If a sparse board
// would blow it up we bail to a cheap, independently-sound fast pass rather
// than risk hanging or — worse — reporting an unproven tile. Kept pure
// (plain data in, plain data out) so it can be unit-tested in isolation.

import { DIG_GRID } from "./solver.ts";
import type { DiggingCell, SolvedBoard } from "./solver.ts";
import type { InventoryItemName } from "../game/index.ts";

export type ResolvedPlot = {
  dx: number;
  dy: number;
  item: InventoryItemName;
};

// One formation instance to place (one per occurrence in `patterns`), with
// its "Seasonal Artefact" placeholder already resolved to the chapter
// artefact. `name` is the formation key, for display only.
export type ResolvedFormation = {
  name: string;
  plots: ResolvedPlot[];
};

export type ForcedTile = {
  x: number;
  y: number;
  item: InventoryItemName;
  // The formation it completes, or "" when the arrangements agree on the
  // item but not on which formation places it.
  formation: string;
};

const key = (x: number, y: number) => y * DIG_GRID + x;

type Placement = {
  name: string;
  cells: number[]; // whole footprint (keys)
  dug: number[]; // revealed-treasure cells the footprint covers
  undug: ForcedTile[]; // undug cells, with the item they'd hold
};

// Every in-bounds translation of `f` consistent with the board: revealed
// tiles match the formation's item, and no plot lands on a tile the crab
// pass already proved empty.
function placementsOf(
  cells: DiggingCell[][],
  f: ResolvedFormation,
): Placement[] {
  const xs = f.plots.map((p) => p.dx);
  const ys = f.plots.map((p) => p.dy);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const out: Placement[] = [];
  for (let dx = -minX; dx <= DIG_GRID - 1 - maxX; dx++) {
    for (let dy = -minY; dy <= DIG_GRID - 1 - maxY; dy++) {
      const all: number[] = [];
      const dug: number[] = [];
      const undug: ForcedTile[] = [];
      let ok = true;
      for (const p of f.plots) {
        const x = p.dx + dx;
        const y = p.dy + dy;
        const cell = cells[y][x];
        const k = key(x, y);
        all.push(k);
        if (cell.dug) {
          if (cell.item !== p.item) {
            ok = false;
            break;
          }
          dug.push(k);
        } else {
          if (cell.status === "empty") {
            ok = false;
            break;
          }
          undug.push({ x, y, item: p.item, formation: f.name });
        }
      }
      if (ok) out.push({ name: f.name, cells: all, dug, undug });
    }
  }
  return out;
}

// Merge a forced tile into the accumulator, dropping any tile two passes
// disagree on (belt-and-braces — never show a guess).
function makeAccumulator() {
  const forced = new Map<string, ForcedTile>();
  const conflicts = new Set<string>();
  return {
    add(tile: ForcedTile) {
      const k = `${tile.x}-${tile.y}`;
      const existing = forced.get(k);
      if (existing && existing.item !== tile.item) {
        conflicts.add(k);
        return;
      }
      // Prefer a tile that names its formation over one that can't.
      if (!existing || (!existing.formation && tile.formation)) {
        forced.set(k, tile);
      }
    },
    result(): ForcedTile[] {
      for (const k of conflicts) forced.delete(k);
      return [...forced.values()];
    },
  };
}

// Cheap, independently-sound rules used as the fallback when the global
// search is too big: a formation with a single consistent placement is
// pinned, and a revealed treasure unique to one formation pins that
// formation if it has a single placement covering it.
function fastForced(
  cells: DiggingCell[][],
  byName: Map<string, ResolvedFormation>,
): ForcedTile[] {
  const acc = makeAccumulator();

  const itemNames = new Map<InventoryItemName, Set<string>>();
  for (const f of byName.values()) {
    for (const p of f.plots) {
      let set = itemNames.get(p.item);
      if (!set) {
        set = new Set();
        itemNames.set(p.item, set);
      }
      set.add(f.name);
    }
  }

  const placementCache = new Map<string, Placement[]>();
  const placements = (f: ResolvedFormation) => {
    let pls = placementCache.get(f.name);
    if (!pls) {
      pls = placementsOf(cells, f);
      placementCache.set(f.name, pls);
    }
    return pls;
  };

  // Rule 1 — a formation that fits exactly one spot is pinned.
  for (const f of byName.values()) {
    const pls = placements(f);
    if (pls.length === 1) for (const u of pls[0].undug) acc.add(u);
  }

  // Rule 2 — a revealed treasure unique to one formation that has exactly
  // one consistent placement covering it pins that placement.
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const cell = cells[y][x];
      if (cell.kind !== "treasure" || cell.item === null) continue;
      const names = itemNames.get(cell.item);
      if (!names || names.size !== 1) continue;
      const f = byName.get([...names][0]);
      if (!f) continue;
      const covering = placements(f).filter((p) => p.dug.includes(key(x, y)));
      if (covering.length === 1) for (const u of covering[0].undug) acc.add(u);
    }
  }

  return acc.result();
}

// Bounds — generous enough for any real (mid/late-game) board, where the
// revealed treasures pin the layout to a handful of arrangements.
const MAX_SOLUTIONS = 4000;
const MAX_STEPS = 1_000_000;

// Find tiles whose treasure is proven across every valid global layout.
export function solveFormations(
  cells: DiggingCell[][],
  instances: ResolvedFormation[],
): ForcedTile[] {
  if (instances.length === 0) return [];

  const byName = new Map<string, ResolvedFormation>();
  for (const f of instances) if (!byName.has(f.name)) byName.set(f.name, f);

  // Revealed treasures every layout must cover.
  const need: number[] = [];
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      if (cells[y][x].kind === "treasure") need.push(key(x, y));
    }
  }

  // Placements per instance. A 0-placement instance means the board is
  // inconsistent with our model — bail to the fast pass.
  const perInstance = instances.map((f) => placementsOf(cells, f));
  if (perInstance.some((p) => p.length === 0)) return fastForced(cells, byName);

  // Most-constrained instance first.
  const order = perInstance
    .map((_, i) => i)
    .sort((a, b) => perInstance[a].length - perInstance[b].length);
  const ordered = order.map((i) => perInstance[i]);

  // For coverage pruning: the latest depth at which each needed cell can
  // still be covered. If we pass it without covering, the branch is dead.
  const lastCoverer = new Map<number, number>();
  ordered.forEach((pls, depth) => {
    for (const pl of pls)
      for (const c of pl.dug) {
        lastCoverer.set(c, Math.max(lastCoverer.get(c) ?? -1, depth));
      }
  });
  for (const c of need)
    if (!lastCoverer.has(c)) return fastForced(cells, byName);
  // Needed cells grouped by the depth after which they're uncoverable.
  const deadlineAt: number[][] = ordered.map(() => []);
  for (const c of need) deadlineAt[lastCoverer.get(c)!].push(c);

  const occupied = new Set<number>();
  const covered = new Set<number>();
  const chosen: Placement[] = [];
  const solutions: Placement[][] = [];
  let steps = 0;
  let bailed = false;

  const search = (depth: number): void => {
    if (bailed) return;
    if (++steps > MAX_STEPS) {
      bailed = true;
      return;
    }
    if (depth === ordered.length) {
      for (const c of need) if (!covered.has(c)) return;
      solutions.push(chosen.slice());
      if (solutions.length > MAX_SOLUTIONS) bailed = true;
      return;
    }
    for (const pl of ordered[depth]) {
      let clash = false;
      for (const c of pl.cells) {
        if (occupied.has(c)) {
          clash = true;
          break;
        }
      }
      if (clash) continue;

      const addedCover: number[] = [];
      for (const c of pl.cells) occupied.add(c);
      for (const c of pl.dug) {
        if (!covered.has(c)) {
          covered.add(c);
          addedCover.push(c);
        }
      }
      // Prune if any cell that can no longer be covered after this depth is
      // still uncovered.
      let dead = false;
      for (const c of deadlineAt[depth]) {
        if (!covered.has(c)) {
          dead = true;
          break;
        }
      }
      if (!dead) {
        chosen.push(pl);
        search(depth + 1);
        chosen.pop();
      }

      for (const c of pl.cells) occupied.delete(c);
      for (const c of addedCover) covered.delete(c);
      if (bailed) return;
    }
  };
  search(0);

  if (bailed) return fastForced(cells, byName);

  // Forced = undug cells covered in EVERY solution, with one agreed item.
  const items = new Map<number, Set<InventoryItemName>>();
  const names = new Map<number, Set<string>>();
  const coverCount = new Map<number, number>();
  for (const sol of solutions) {
    const seen = new Set<number>();
    for (const pl of sol) {
      for (const u of pl.undug) {
        const k = key(u.x, u.y);
        let is = items.get(k);
        if (!is) items.set(k, (is = new Set()));
        is.add(u.item);
        let ns = names.get(k);
        if (!ns) names.set(k, (ns = new Set()));
        ns.add(u.formation);
        if (!seen.has(k)) {
          seen.add(k);
          coverCount.set(k, (coverCount.get(k) ?? 0) + 1);
        }
      }
    }
  }

  const acc = makeAccumulator();
  for (const [k, is] of items) {
    if (is.size !== 1 || coverCount.get(k) !== solutions.length) continue;
    const ns = names.get(k)!;
    acc.add({
      x: k % DIG_GRID,
      y: Math.floor(k / DIG_GRID),
      item: [...is][0],
      formation: ns.size === 1 ? [...ns][0] : "",
    });
  }
  return acc.result();
}

// Overlay the forced tiles onto a solved board: each becomes a guaranteed
// "dig here" tile carrying its predicted item, and the tally is recomputed.
// Returns the original board unchanged when nothing is forced.
export function applyForcedTiles(
  solved: SolvedBoard,
  forced: ForcedTile[],
): SolvedBoard {
  if (forced.length === 0) return solved;

  const cells = solved.cells.map((row) => row.slice());
  for (const tile of forced) {
    const cell = cells[tile.y][tile.x];
    if (cell.dug) continue; // never override a revealed tile
    cells[tile.y][tile.x] = {
      ...cell,
      status: "guaranteed",
      predicted: { item: tile.item, formation: tile.formation },
    };
  }

  const tally = { ...solved.tally, guaranteed: 0, possible: 0, empty: 0 };
  for (let y = 0; y < DIG_GRID; y++) {
    for (let x = 0; x < DIG_GRID; x++) {
      const status = cells[y][x].status;
      if (status === "guaranteed") tally.guaranteed++;
      else if (status === "possible") tally.possible++;
      else if (status === "empty") tally.empty++;
    }
  }

  return { cells, tally };
}
