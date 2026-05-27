import type { FarmResponse } from "../api/fetchFarm.ts";
import { IdlePanel } from "../components/IdlePanel.tsx";
import { InstallPromptPanel } from "../components/InstallPromptPanel.tsx";
import { ReadyPanel } from "../components/NextUpPanel.tsx";
import { TimerSection } from "../components/TimerSection.tsx";
import type { AggregatedTimer, Category } from "../timers/index.ts";

// Page body of the /timers route. Layout has two regions:
//
// 1. Full-width Ready banner above the column flow. ReadyPanel
//    renders nothing when no timers are ready, so the banner
//    collapses to zero vertical space in that case.
// 2. The multi-column flow (matches the FarmInfo page's grid) for
//    Idle + InstallPrompt + every category TimerSection. Source
//    order is Idle → Install → CATEGORY_ORDER timers; the browser
//    auto-balances the column heights.
//
// Column count per breakpoint:
//   <sm  : 1 col (mobile, full-width stack)
//   sm   : 2 cols
//   lg   : 3 cols
//   2xl+ : 4 cols
export function LiveTimersPage({
  data,
  timers,
  byCategory,
  visibleCategories,
  now,
}: {
  data: FarmResponse;
  timers: AggregatedTimer[];
  byCategory: Map<string, AggregatedTimer[]>;
  visibleCategories: Category[];
  now: number;
}) {
  return (
    <>
      {/* Ready banner sits OUTSIDE the column container so it spans the
          full row above the grid. Its internal layout (rows vs grid)
          is governed by the `layout="banner"` prop on ReadyPanel. */}
      <div className="mb-2">
        <ReadyPanel timers={timers} now={now} layout="banner" />
      </div>
      <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
        <IdlePanel state={data.farm} byCategory={byCategory} now={now} />
        <InstallPromptPanel farmId={data.id} />
        {visibleCategories.map((cat) => (
          <TimerSection
            key={cat}
            category={cat}
            timers={byCategory.get(cat) ?? []}
            now={now}
          />
        ))}
      </div>
    </>
  );
}
