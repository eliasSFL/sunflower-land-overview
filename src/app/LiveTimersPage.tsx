import { Fragment } from "react";

import { NextUpPanel, ReadyPanel } from "../components/NextUpPanel.tsx";
import type { AggregatedTimer } from "../timers/index.ts";
import type { PanelDescriptor } from "./panelRegistry.tsx";

// Page body of the /timers route. Layout has two regions:
//
// 1. Full-width Ready + Next up banners stacked above the column flow.
//    Each renders nothing when it has no rows, so an empty banner
//    collapses to zero height (the flex `gap` only spaces banners that
//    actually render). Next up sits directly under Ready so "what's
//    coming" reads as a continuation of "what's ready now".
// 2. The multi-column flow (matches the FarmInfo page's grid). The panel
//    list (`panels`) is resolved by the per-page arrangement in App —
//    pinned Install first, then the player's reordered, non-hidden
//    panels — so source order here is whatever they arranged. The browser
//    auto-balances the column heights.
//
// Column count per breakpoint:
//   <sm  : 1 col (mobile, full-width stack)
//   sm   : 2 cols
//   lg   : 3 cols
//   2xl+ : 4 cols
export function LiveTimersPage({
  panels,
  timers,
  now,
}: {
  panels: PanelDescriptor[];
  timers: AggregatedTimer[];
  now: number;
}) {
  return (
    <>
      {/* Banners sit OUTSIDE the column container so they span the full
          row above the grid. They're not part of the arrangeable flow.
          `empty:hidden` collapses the wrapper (including its `mb-2`) when
          both banners return null. */}
      <div className="mb-2 flex flex-col gap-2 empty:hidden">
        <ReadyPanel timers={timers} now={now} layout="banner" />
        <NextUpPanel timers={timers} now={now} layout="banner" />
      </div>
      <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
        {panels.map((p) => (
          <Fragment key={p.id}>{p.render()}</Fragment>
        ))}
      </div>
    </>
  );
}
