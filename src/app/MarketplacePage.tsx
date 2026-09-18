import { useState } from "react";

import type { FarmResponse } from "../api/fetchFarm.ts";
import { MarketSnapshotPanel } from "../components/MarketSnapshotPanel.tsx";
import { MyMarketplacePanel } from "../components/MyMarketplacePanel.tsx";
import { TradeableDetailPanel } from "../components/TradeableDetailPanel.tsx";
import type { MarketItem } from "../components/marketplaceItems.ts";

// Page body of the /marketplace route.
//
// Bespoke rather than arrangeable (like Now and Digging): the three
// sections are a single reading order — what's yours, then the market,
// then whichever item you drilled into — and the drill-down only exists
// as a consequence of a click in the section above it, so letting a
// player reorder or hide them would mostly produce broken states.
//
// Ordering puts YOUR trading first. Everything else on this page is the
// whole market, which is context; the thing a player opens this tab to
// check is whether their own listings have moved.
//
// Selection lives here rather than inside the market panel because the
// detail panel is a sibling, not a child — the market table stays in
// view and keeps its scroll position while the drill-down opens under
// it.
export function MarketplacePage({
  data,
  now,
}: {
  data: FarmResponse;
  now: number;
}) {
  const [selected, setSelected] = useState<MarketItem | null>(null);

  return (
    <>
      <MyMarketplacePanel farmId={data.id} />
      <MarketSnapshotPanel
        now={now}
        onSelect={(item) =>
          // Clicking the open row closes it — the row doubles as the
          // detail panel's toggle, so there is no orphaned "open" state
          // with nothing highlighted.
          setSelected((current) => (current?.key === item.key ? null : item))
        }
        selectedKey={selected?.key}
      />
      {selected ? (
        <TradeableDetailPanel
          // Remount on item change so the detail panel never shows the
          // previous item's history while the new one loads.
          key={selected.key}
          item={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
