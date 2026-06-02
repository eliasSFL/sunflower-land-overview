import type { CSSProperties } from "react";

import { InnerPanel } from "./ui/index.ts";
import { getItemIcon } from "../game/index.ts";
import { DIG_ICONS } from "../digging/assets.ts";
import type { DiggingStatus } from "../digging/solver.ts";

type LegendRow = {
  status: DiggingStatus;
  title: string;
  desc: string;
  sprite?: string;
};

const ROWS: LegendRow[] = [
  {
    status: "empty",
    title: "No treasure",
    desc: "A sand tile borders it — all of the sand's sides are clear.",
  },
  {
    status: "possible",
    title: "Possible",
    desc: "A crab borders it — treasure may be in one of the crab's directions.",
  },
  {
    status: "crab",
    title: "Crab here",
    desc: "Can't hide a treasure but it's next to one — so it'll dig up a crab.",
    sprite: getItemIcon("Crab"),
  },
  {
    status: "sand",
    title: "Sand here",
    desc: "Can't hide a treasure and none borders it — so it'll dig up sand.",
    sprite: getItemIcon("Sand"),
  },
  {
    status: "guaranteed",
    title: "Dig here",
    desc: "The only spot left that can satisfy a crab. A certain treasure.",
  },
  {
    status: "treasure",
    title: "Discovered",
    desc: "A treasure you've already dug up.",
    sprite: getItemIcon("Camel Bone"),
  },
  {
    status: "clue-sand",
    title: "Sand clue",
    desc: "Not treasure. Its 4 neighbours are empty.",
    sprite: getItemIcon("Sand"),
  },
  {
    status: "clue-crab",
    title: "Crab clue",
    desc: "Not treasure. A treasure is adjacent.",
    sprite: getItemIcon("Crab"),
  },
];

// A tiny swatch reusing the real tile treatment (flag) so the colours in
// the legend always match the board exactly.
function LegendChip({
  status,
  sprite,
}: {
  status: DiggingStatus;
  sprite?: string;
}) {
  return (
    <span
      className="relative h-7 w-7 shrink-0 overflow-hidden rounded"
      style={{
        backgroundImage: `url(${DIG_ICONS.siteBg})`,
        backgroundSize: "cover",
        imageRendering: "pixelated",
      }}
    >
      <span
        className="dig-grid"
        data-treat="flag"
        style={{
          position: "absolute",
          inset: 0,
          background: "none",
          display: "block",
        }}
      >
        <span
          className={`dig-cell is-${status}`}
          style={
            {
              position: "absolute",
              inset: 0,
              aspectRatio: "auto",
            } as CSSProperties
          }
        >
          <span className="dig-cell-fill" />
          <span className="dig-cell-flag" />
          {sprite ? (
            <img className="dig-cell-sprite" src={sprite} alt="" />
          ) : null}
        </span>
      </span>
    </span>
  );
}

// Explains the colour rules. Static — it never reads farm data.
export function DiggingLegendPanel() {
  return (
    <InnerPanel>
      <div className="p-1">
        <h3 className="mb-2 flex items-center gap-2 text-sm">
          <img
            src={DIG_ICONS.confused}
            alt=""
            aria-hidden
            className="h-5 w-5"
          />
          How the colours work
        </h3>
        <div className="flex flex-col gap-2">
          {ROWS.map((r) => (
            <div key={r.status} className="flex items-center gap-2.5">
              <LegendChip status={r.status} sprite={r.sprite} />
              <span className="text-xxs leading-tight">
                <b className="block text-xs">{r.title}</b>
                {r.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </InnerPanel>
  );
}
