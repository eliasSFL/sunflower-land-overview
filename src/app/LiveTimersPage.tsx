import type { FarmResponse } from "../api/fetchFarm.ts";
import { IdlePanel } from "../components/IdlePanel.tsx";
import { InstallPromptPanel } from "../components/InstallPromptPanel.tsx";
import { NextUpPanel, ReadyPanel } from "../components/NextUpPanel.tsx";
import { TimerSection } from "../components/TimerSection.tsx";
import type { AggregatedTimer, Category } from "../timers/index.ts";

// Page body of the /timers route. Layout has two regions:
//
// 1. Full-width Ready + Next up banners stacked above the column flow.
//    Each renders nothing when it has no rows, so an empty banner
//    collapses to zero height (the flex `gap` only spaces banners that
//    actually render). Next up sits directly under Ready so "what's
//    coming" reads as a continuation of "what's ready now".
// 2. The multi-column flow (matches the FarmInfo page's grid) for
//    Idle + InstallPrompt + every category TimerSection. Source order
//    is Idle → Install → CATEGORY_ORDER timers; the browser
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
      {/* Banners sit OUTSIDE the column container so they span the full
          row above the grid. Each panel's internal layout (rows vs
          grid) is governed by its `layout="banner"` prop. */}
      {/* `empty:hidden` collapses the wrapper (including its `mb-2`)
          when both banners return null — otherwise the margin would
          leak above the column flow on farms with no ready/next rows. */}
      <div className="mb-2 flex flex-col gap-2 empty:hidden">
        <ReadyPanel timers={timers} now={now} layout="banner" />
        <NextUpPanel timers={timers} now={now} layout="banner" />
      </div>
      <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
        <InstallPromptPanel farmId={data.id} />
        <IdlePanel state={data.farm} byCategory={byCategory} now={now} />
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
