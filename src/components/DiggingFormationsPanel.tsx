import type { CSSProperties } from "react";

import { InnerPanel } from "./ui/index.ts";
import {
  DIGGING_FORMATIONS,
  CHAPTER_ARTEFACT,
  getCurrentChapter,
  getItemIcon,
  type GameState,
  type DiggingFormationName,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { DIG_ICONS } from "../digging/assets.ts";
import { humanizeFormation } from "../digging/formations.ts";

function PatternThumb({
  plots,
  artefactIcon,
}: {
  plots: (typeof DIGGING_FORMATIONS)[keyof typeof DIGGING_FORMATIONS];
  artefactIcon: string;
}) {
  const minX = Math.min(...plots.map((p) => p.x));
  const minY = Math.min(...plots.map((p) => p.y));
  return (
    <div
      className="relative h-16 w-16 rounded"
      style={{
        backgroundImage: `url(${DIG_ICONS.siteBg})`,
        backgroundSize: "25% 25%",
        imageRendering: "pixelated",
      }}
    >
      {plots.map((p, i) => {
        const icon =
          p.name === "Seasonal Artefact" ? artefactIcon : getItemIcon(p.name);
        return (
          <img
            key={i}
            src={icon}
            alt={p.name}
            className="absolute object-contain"
            style={{
              width: "22%",
              height: "22%",
              left: `${(p.x - minX) * 25 + 2}%`,
              top: `${(p.y - minY) * 25 + 2}%`,
            }}
          />
        );
      })}
    </div>
  );
}

// Today's treasure formations to hunt, pulled from `digging.patterns`,
// with a tick on the ones already completed (`completedPatterns` is the
// game's own record — we don't re-derive completion from the grid).
export function DiggingFormationsPanel({
  state,
  now,
}: {
  state: GameState;
  now: number;
}) {
  const { patterns, completedPatterns } = state.desert.digging;
  const artefactIcon = getItemIcon(CHAPTER_ARTEFACT[getCurrentChapter(now)]);

  // A formation can appear in `patterns` more than once (you may need to
  // find the same shape twice in a day). Completing one instance must tick
  // exactly one card — not every duplicate — so we tick the first N
  // occurrences of each formation, where N is how many times it appears in
  // `completedPatterns`. Mirrors the game's own Digby checklist.
  const remaining: Partial<Record<DiggingFormationName, number>> = {};
  for (const name of completedPatterns ?? []) {
    remaining[name] = (remaining[name] ?? 0) + 1;
  }
  const completedByIndex = patterns.map((name) => {
    if ((remaining[name] ?? 0) > 0) {
      remaining[name] = (remaining[name] ?? 0) - 1;
      return true;
    }
    return false;
  });

  return (
    <InnerPanel>
      <div className="p-1">
        <h3 className="mb-2 flex items-center gap-2 text-sm">
          <img
            src={DIG_ICONS.treasure}
            alt=""
            aria-hidden
            className="h-5 w-5"
          />
          Today's formations
        </h3>
        {patterns.length === 0 ? (
          <p className="text-xxs opacity-70">No formations on today's site.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 lg:grid-cols-2">
            {patterns.map((name, i) => {
              const completed = completedByIndex[i];
              return (
                <div
                  key={`${name}-${i}`}
                  className="relative flex flex-col items-center gap-1 rounded border-2 p-1.5"
                  style={
                    {
                      borderColor: completed
                        ? "#3e8948"
                        : "rgba(62,39,49,0.18)",
                      background: completed
                        ? "rgba(62,137,72,0.12)"
                        : "rgba(62,39,49,0.06)",
                    } as CSSProperties
                  }
                >
                  {completed ? (
                    <img
                      src={CHROME_ICONS.confirm}
                      alt="found"
                      className="absolute -right-1.5 -top-1.5 h-5 w-5"
                    />
                  ) : null}
                  <PatternThumb
                    plots={DIGGING_FORMATIONS[name]}
                    artefactIcon={artefactIcon}
                  />
                  <span className="text-center text-xxs leading-tight">
                    {humanizeFormation(name)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xxs opacity-70">
          Dig a full formation before the daily reset to claim its reward.
        </p>
      </div>
    </InnerPanel>
  );
}
