import { useMemo } from "react";

import type { FarmResponse } from "../api/fetchFarm.ts";
import { DiggingBoardPanel } from "../components/DiggingBoardPanel.tsx";
import { DiggingFormationsPanel } from "../components/DiggingFormationsPanel.tsx";
import { DiggingLegendPanel } from "../components/DiggingLegendPanel.tsx";
import { DiggingStatsPanel } from "../components/DiggingStatsPanel.tsx";
import { CHAPTER_ARTEFACT, getCurrentChapter } from "../game/index.ts";
import { resolveFormations } from "../digging/formations.ts";
import {
  solveFormations,
  applyForcedTiles,
} from "../digging/formationSolver.ts";
import { solveDiggingGrid } from "../digging/solver.ts";
import "../digging/digging.css";

// Page body of the /digging route — Digby's dig site. A read-only mirror
// of `state.desert.digging.grid` with the sand/crab deduction painted on,
// flanked by the stats strip, colour legend, and today's formations.
//
// The app already frames every route in one OuterPanel, so the page is
// just a stack of InnerPanels — matching how /timers and /info compose.
export function DiggingPage({
  data,
  now,
}: {
  data: FarmResponse;
  now: number;
}) {
  const state = data.farm;
  const grid = state.desert.digging.grid;
  // Re-solve only when the dug-hole list changes (a refresh), not on the
  // 1 Hz `now` tick that drives the countdowns.
  const solved = useMemo(() => solveDiggingGrid(grid), [grid]);

  // Second pass: prove the *identity* of tiles that complete a known
  // formation, and surface them as named "dig here" tiles. `artefact` only
  // shifts at a chapter boundary, so this stays off the per-second path.
  const artefact = CHAPTER_ARTEFACT[getCurrentChapter(now)];
  const formations = useMemo(
    () => resolveFormations(state, artefact),
    [state, artefact],
  );
  const board = useMemo(
    () => applyForcedTiles(solved, solveFormations(solved.cells, formations)),
    [solved, formations],
  );

  return (
    // Cap the page so the board sits at a fixed size and the side column
    // doesn't sprawl on big monitors (mirrors the design's `.page` cap).
    <div className="mx-auto flex w-full max-w-300 flex-col gap-2">
      <DiggingStatsPanel state={state} now={now} />
      {/* Board column is a fixed ~44rem so tiles stay a set size; the
          side column takes the rest. Collapses to one column below lg. */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[44rem_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <DiggingBoardPanel solved={board} farmId={data.id} />
        </div>
        <div className="flex flex-col gap-2">
          <DiggingLegendPanel />
          <DiggingFormationsPanel state={state} now={now} />
        </div>
      </div>
      <p className="text-xxs opacity-60">
        A community deduction tool — it reasons only from the sand &amp; crab
        clues already on your dig site, and never reveals anything the board
        doesn&apos;t already prove.
      </p>
    </div>
  );
}
