import type { AggregatedTimer } from "../timers/index.ts";
import { CollectNowPanel } from "../components/CollectNowPanel.tsx";
import { IdlePanel } from "../components/IdlePanel.tsx";
import { NowTimelinePanel } from "../components/NowTimelinePanel.tsx";
import type { FarmResponse } from "../api/fetchFarm.ts";

// Page body of the /now route — the "what should I do right now?" view.
// A bespoke stack (no arrangeable flow), top to bottom:
//
// 1. Collect now — every ready item across the whole farm, grouped by
//    where it lives. The single most-used answer: "what can I grab?"
// 2. Next 4 hours — a horizontal timeline of what's about to land, so a
//    wave of ripening reads as a shape, not a scroll.
// 3. Idle — buildings/plots sitting empty (wasted capacity), the most
//    actionable "you could be doing this" nudge.
//
// Each panel self-hides when it has nothing to show, so a quiet farm
// collapses gracefully rather than rendering empty cards.
export function NowPage({
  data,
  timers,
  byCategory,
  now,
}: {
  data: FarmResponse;
  timers: AggregatedTimer[];
  byCategory: Map<string, AggregatedTimer[]>;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <CollectNowPanel timers={timers} now={now} />
      <NowTimelinePanel timers={timers} now={now} />
      <IdlePanel state={data.farm} byCategory={byCategory} now={now} />
    </div>
  );
}
