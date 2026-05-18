import type { FarmResponse } from "../api/fetchFarm.ts";
import { BumpkinSummaryPanel } from "../components/BumpkinSummaryPanel.tsx";
import { DeliveriesPanel } from "../components/DeliveriesPanel.tsx";
import { IdlePanel } from "../components/IdlePanel.tsx";
import { NextUpPanel, ReadyPanel } from "../components/NextUpPanel.tsx";
import { TimerSection } from "../components/TimerSection.tsx";
import type { AggregatedTimer, Category } from "../timers/index.ts";
import { FarmIdPanel } from "./FarmIdPanel.tsx";

// Single CSS multi-column flow containing every panel. Source order is
// FarmIdPanel → BumpkinSummary → Ready → NextUp → Idle → Deliveries →
// CATEGORY_ORDER timer panels; the browser auto-balances heights across
// columns. Column count per breakpoint:
//   <sm  : 1 col (mobile, full-width stack)
//   sm   : 2 cols
//   lg   : 3 cols
//   2xl+ : 4 cols
// Adding more panels just makes existing columns taller — no breakpoint
// maintenance needed. `break-inside-avoid` on each direct child keeps
// panels intact across column boundaries.
export function DashboardGrid({
  data,
  timers,
  byCategory,
  visibleCategories,
  now,
  farmId,
  accessDenied,
  error,
  loading,
  onLoad,
}: {
  data: FarmResponse | undefined;
  timers: AggregatedTimer[];
  byCategory: Map<string, AggregatedTimer[]>;
  visibleCategories: Category[];
  now: number;
  farmId: string;
  accessDenied: boolean;
  error: string | undefined;
  loading: boolean;
  onLoad: (id: string) => Promise<void>;
}) {
  return (
    <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
      {!data ? (
        <FarmIdPanel
          farmId={farmId}
          accessDenied={accessDenied}
          error={error}
          loading={loading}
          onSubmit={onLoad}
        />
      ) : null}
      {data ? <BumpkinSummaryPanel data={data} /> : null}
      {data ? <ReadyPanel timers={timers} now={now} /> : null}
      {data ? <NextUpPanel timers={timers} now={now} /> : null}
      {data ? (
        <IdlePanel state={data.farm} byCategory={byCategory} now={now} />
      ) : null}
      {data ? <DeliveriesPanel state={data.farm} now={now} /> : null}
      {data
        ? visibleCategories.map((cat) => (
            <TimerSection
              key={cat}
              category={cat}
              timers={byCategory.get(cat) ?? []}
              now={now}
            />
          ))
        : null}
    </div>
  );
}
