import { Fragment } from "react";

import type { PanelDescriptor } from "./panelRegistry.tsx";

// Page body of the /info route. Same multi-column flow as the LiveTimers
// page so the visual rhythm carries between tabs, but populated with
// identity / activity / event panels. The panel list (`panels`) is
// resolved by the per-page arrangement in App — pinned Install first, then
// the player's reordered, non-hidden panels — so source order is whatever
// they arranged. The browser auto-balances column heights.
//
// Column count per breakpoint:
//   <sm  : 1 col (mobile, full-width stack)
//   sm   : 2 cols
//   lg   : 3 cols
//   2xl+ : 4 cols
//
// Several panels (InstallPrompt, LoveIslandShop, …) return null when not
// relevant, so the order degrades gracefully without empty cards.
export function FarmInfoPage({ panels }: { panels: PanelDescriptor[] }) {
  return (
    <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
      {panels.map((p) => (
        <Fragment key={p.id}>{p.render()}</Fragment>
      ))}
    </div>
  );
}
