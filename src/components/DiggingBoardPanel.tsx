import { useState, type CSSProperties } from "react";
import classNames from "classnames";

import {
  PRIMARY_BUTTON_URL,
  PRIMARY_BUTTON_PRESSED_URL,
} from "./ui/borderStyles.ts";
import { InnerPanel, Label } from "./ui/index.ts";
import { getItemIcon } from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import {
  DIG_ICONS,
  DIG_TREATMENTS,
  type DigTreatment,
} from "../digging/assets.ts";
import {
  DIG_GRID,
  type DiggingCell,
  type SolvedBoard,
} from "../digging/solver.ts";
import { humanizeFormation } from "../digging/formations.ts";

// Spreadsheet-style coordinate label, e.g. column 9 row 1 → "J1".
function coordLabel(x: number, y: number): string {
  return String.fromCharCode(65 + x) + (y + 1);
}

// One-line explanation of why a tile is coloured the way it is.
function explain(cell: DiggingCell): string {
  // A formation-proven tile: we know exactly what it hides.
  if (cell.predicted) {
    const { item, formation } = cell.predicted;
    return formation
      ? `Dig here → ${item} — completes the ${humanizeFormation(formation)} formation.`
      : `Dig here → ${item} — the only treasure the formations can leave here.`;
  }
  switch (cell.status) {
    case "guaranteed":
      return "Dig here — the only tile left that can satisfy a neighbouring crab.";
    case "treasure":
      return `${cell.item} — a treasure you've already dug up.`;
    case "clue-sand":
      return "Sand clue — guarantees no treasure on any of its 4 sides.";
    case "clue-crab":
      return "Crab clue — at least one of its 4 sides hides a treasure.";
    case "empty":
      return "No treasure here — a sand clue borders this tile.";
    case "crab":
      return "It's a crab — it can't hide a treasure, yet it borders one, so digging here turns up a crab.";
    case "sand":
      return "It's sand — proven treasure-free, and no treasure can border it, so digging here turns up sand.";
    case "possible":
      return "Possible treasure — a crab borders this tile.";
    default:
      return "No clue nearby yet — nothing can be deduced about this tile.";
  }
}

const segVariables = {
  "--button-image": `url(${PRIMARY_BUTTON_URL})`,
  "--button-pressed-image": `url(${PRIMARY_BUTTON_PRESSED_URL})`,
} as CSSProperties;

const SEG_STYLE: CSSProperties = {
  ...segVariables,
  borderStyle: "solid",
  borderWidth: "8px 8px 10px 8px",
  imageRendering: "pixelated",
  borderImageRepeat: "stretch",
  borderRadius: "13.125px",
  color: "#674544",
};

// Compact segmented-control pill (Flag / Heat / Glow). Uses the same
// pressed-for-active border-image treatment as the PageNavMenu sheet
// rows, but a plain button (no routing).
function SegPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={classNames(
        "flex cursor-pointer items-center justify-center px-2 text-xs leading-none transition-transform",
        active
          ? "[border-image:var(--button-pressed-image)_3_3_4_3_fill]! translate-y-px"
          : "[border-image:var(--button-image)_3_3_4_3_fill]! hover:brightness-90 active:scale-[0.99]",
      )}
      style={SEG_STYLE}
    >
      <span className="mb-1">{label}</span>
    </button>
  );
}

function DiggingTile({
  cell,
  selected,
  peek,
  onClick,
}: {
  cell: DiggingCell;
  selected: boolean;
  peek: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${coordLabel(cell.x, cell.y)} ${cell.item ?? cell.status}`}
      className={classNames("dig-cell", `is-${cell.status}`, {
        "is-undug": !cell.dug,
        "is-selected": selected,
        "is-peek": peek,
      })}
    >
      <span className="dig-cell-fill" />
      <span className="dig-cell-flag" />
      {cell.item ? (
        <img
          className="dig-cell-sprite"
          src={getItemIcon(cell.item)}
          alt={cell.item}
        />
      ) : cell.predicted ? (
        // Formation-proven tile: show the treasure it must hide, ghosted to
        // read as "predicted, not yet dug".
        <img
          className="dig-cell-sprite dig-cell-predicted"
          src={getItemIcon(cell.predicted.item)}
          alt={`${cell.predicted.item} (predicted)`}
        />
      ) : cell.status === "crab" ? (
        // Crab-proven tile: a ghosted crab, the same "predicted, not yet dug"
        // treatment as a forced treasure.
        <img
          className="dig-cell-sprite dig-cell-predicted"
          src={getItemIcon("Crab")}
          alt="Crab (predicted)"
        />
      ) : cell.status === "sand" ? (
        // Sand-proven tile: a ghosted sand sprite, same predicted treatment.
        <img
          className="dig-cell-sprite dig-cell-predicted"
          src={getItemIcon("Sand")}
          alt="Sand (predicted)"
        />
      ) : null}
      {/* The shovel marker is only for crab-proven digs; a predicted tile
          shows its treasure sprite instead. */}
      {cell.predicted ? null : (
        <span className="dig-cell-dot">
          <img src={DIG_ICONS.dig} alt="" aria-hidden />
        </span>
      )}
    </button>
  );
}

type Props = {
  solved: SolvedBoard;
  farmId: number;
};

// The dig-site board: a read-only mirror of the live grid with the
// sand/crab deduction painted on. Owns its own view state (which tile
// treatment is shown, which tile is being inspected) so the once-a-second
// page re-render doesn't reset it.
export function DiggingBoardPanel({ solved, farmId }: Props) {
  const [treatment, setTreatment] = useState<DigTreatment>("flag");
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(
    null,
  );

  const { tally } = solved;
  const unrevealed = DIG_GRID * DIG_GRID - tally.dug;

  // The selected tile's 4 cardinal neighbours, highlighted as "peek".
  const peek = new Set<string>();
  if (selected) {
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const nx = selected.x + dx;
      const ny = selected.y + dy;
      if (nx >= 0 && nx < DIG_GRID && ny >= 0 && ny < DIG_GRID) {
        peek.add(`${nx}-${ny}`);
      }
    }
  }
  const selectedCell = selected ? solved.cells[selected.y][selected.x] : null;

  return (
    <InnerPanel>
      {/* Cap + centre the board content so tiles stay a set size even in
          the single-column layout (below lg) and on wide phones/tablets. */}
      <div className="mx-auto w-full max-w-176 p-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-col gap-1">
            <Label type="success" icon={CHROME_ICONS.confirm}>
              Mirrored from farm #{farmId}
            </Label>
            <span className="text-xxs opacity-75">
              {tally.dug} dug · {unrevealed} unrevealed
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xxs opacity-80">Tiles</span>
            <div className="flex gap-1.5">
              {DIG_TREATMENTS.map((t) => (
                <SegPill
                  key={t.id}
                  label={t.label}
                  active={treatment === t.id}
                  onClick={() => setTreatment(t.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div
          className="dig-grid is-interactive"
          data-treat={treatment}
          style={
            { "--dig-site-bg": `url(${DIG_ICONS.siteBg})` } as CSSProperties
          }
        >
          {solved.cells.map((row, y) =>
            row.map((cell, x) => (
              <DiggingTile
                key={`${x}-${y}`}
                cell={cell}
                selected={!!selected && selected.x === x && selected.y === y}
                peek={peek.has(`${x}-${y}`)}
                onClick={() =>
                  setSelected(
                    selected && selected.x === x && selected.y === y
                      ? null
                      : { x, y },
                  )
                }
              />
            )),
          )}
        </div>

        {selectedCell ? (
          <div
            className="mt-2 flex items-center gap-2 rounded border-2 p-1.5"
            style={{
              borderColor: "rgba(62,39,49,0.2)",
              background: "rgba(62,39,49,0.08)",
            }}
          >
            <Label type="info">
              {coordLabel(selectedCell.x, selectedCell.y)}
            </Label>
            <span className="flex-1 text-xxs leading-tight">
              {explain(selectedCell)}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="shrink-0 cursor-pointer"
            >
              <img
                src={CHROME_ICONS.close}
                alt=""
                aria-hidden
                className="h-4 w-4"
              />
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xxs">
            <Label type="success" icon={DIG_ICONS.dig}>
              {tally.guaranteed} sure digs
            </Label>
            <Label type="warning">{tally.possible} maybes</Label>
            <Label type="danger">{tally.empty} safe-empty</Label>
            {tally.crabPredicted > 0 ? (
              <Label type="default" icon={getItemIcon("Crab")}>
                {tally.crabPredicted}{" "}
                {tally.crabPredicted === 1 ? "crab" : "crabs"}
              </Label>
            ) : null}
            {tally.sandPredicted > 0 ? (
              <Label type="default" icon={getItemIcon("Sand")}>
                {tally.sandPredicted} sand
              </Label>
            ) : null}
            <span className="opacity-70">Tap a tile to see why.</span>
          </div>
        )}
      </div>
    </InnerPanel>
  );
}
