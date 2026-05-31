// Glue between game state and the pure formation solver: humanises
// formation keys for display, and resolves today's distinct formations to
// absolute-item shapes. Imports the game/index value barrel, so it stays
// out of the unit-tested solver modules.

import {
  DIGGING_FORMATIONS,
  type GameState,
  type InventoryItemName,
} from "../game/index.ts";
import type { ResolvedFormation } from "./formationSolver.ts";

// "OLD_BOTTLE" → "Old Bottle", "MONDAY_ARTEFACT_FORMATION" → "Monday
// Artefact". The upstream formation keys are the only label we have.
export function humanizeFormation(key: string): string {
  return key
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\bformation\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Resolve today's formations into placement instances for the solver — one
// per occurrence in `patterns` (a formation listed twice is two instances to
// place), with upstream's "Seasonal Artefact" placeholder mapped to the
// current chapter `artefact`. Completed instances are included too: the
// exact-cover solver places every instance, and the already-dug ones pin
// where the rest can go.
export function resolveFormations(
  state: GameState,
  artefact: InventoryItemName,
): ResolvedFormation[] {
  return state.desert.digging.patterns.map((name) => ({
    name,
    plots: DIGGING_FORMATIONS[name].map((plot) => ({
      dx: plot.x,
      dy: plot.y,
      item: plot.name === "Seasonal Artefact" ? artefact : plot.name,
    })),
  }));
}
