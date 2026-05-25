import { useMemo, useState } from "react";

import { MobileNav } from "../components/MobileNav.tsx";
import { RefreshButton } from "../components/RefreshButton.tsx";
import { SettingsButton } from "../components/SettingsButton.tsx";
import { SettingsModal } from "../components/SettingsModal.tsx";
import { OuterPanel } from "../components/ui/index.ts";
import { useFarmData, REFRESH_COOLDOWN_MS } from "../hooks/useFarmData.ts";
import { useNavSections } from "../hooks/useNavSections.ts";
import { useNow } from "../hooks/useNow.ts";
import { usePushSubscriptionChangeSync } from "../notifications/usePushSubscriptionChangeSync.ts";
import {
  extractAndAggregate,
  CATEGORY_ORDER,
  PLACEMENT_GATED_CATEGORIES,
  EVENT_GATED_CATEGORIES,
} from "../timers/index.ts";
import { DashboardGrid } from "./DashboardGrid.tsx";
import { DashboardHeader } from "./DashboardHeader.tsx";

export function App() {
  const { farmId, data, loading, error, accessDenied, lastFetchedAt, load } =
    useFarmData();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const now = useNow(1000);

  usePushSubscriptionChangeSync(data?.id);

  const timers = useMemo(() => {
    if (!data) return [];
    const id = data.id ?? (Number(farmId) || 0);
    return extractAndAggregate(data.farm, id, now);
  }, [data, farmId, now]);

  const byCategory = useMemo(() => {
    const grouped = new Map<string, typeof timers>();
    for (const t of timers) {
      const list = grouped.get(t.category) ?? [];
      list.push(t);
      grouped.set(t.category, list);
    }
    return grouped;
  }, [timers]);

  // Cooking buildings + Aging Shed racks only show up if the player has
  // actually placed the building — otherwise we'd render a "Smoothie
  // Shack: Not cooking" / "Aging Rack: No fish aging" panel (and a
  // MobileNav chip) for a building they don't own. Love Island is
  // gated the same way but on the event being in-season (its extractor
  // emits nothing off-season). Other categories (Crops, Animals, …)
  // always render so the panel still serves as a "you could be doing
  // this" reminder when idle.
  const visibleCategories = useMemo(
    () =>
      CATEGORY_ORDER.filter((cat) => {
        if (
          PLACEMENT_GATED_CATEGORIES.includes(cat) ||
          EVENT_GATED_CATEGORIES.includes(cat)
        ) {
          return (byCategory.get(cat) ?? []).length > 0;
        }
        return true;
      }),
    [byCategory],
  );

  const navSections = useNavSections({
    data,
    timers,
    byCategory,
    visibleCategories,
    now,
  });

  const cooldownLeft =
    lastFetchedAt !== undefined
      ? Math.max(0, REFRESH_COOLDOWN_MS - (now - lastFetchedAt))
      : 0;

  return (
    <div className="min-h-dvh bg-[#181425]">
      <OuterPanel className="min-h-dvh">
        <DashboardHeader data={data} lastFetchedAt={lastFetchedAt} now={now} />
        <DashboardGrid
          data={data}
          timers={timers}
          byCategory={byCategory}
          visibleCategories={visibleCategories}
          now={now}
          farmId={farmId}
          accessDenied={accessDenied}
          error={error}
          loading={loading}
          onLoad={load}
        />
        {/* Extra bottom padding on `<sm` so the fixed MobileNav strip
            doesn't cover the last section. */}
        <div className="h-16 sm:hidden" aria-hidden />
      </OuterPanel>
      {data ? <MobileNav sections={navSections} /> : null}
      {data ? (
        <>
          <RefreshButton
            onClick={() => load(farmId)}
            loading={loading}
            cooldownLeftMs={cooldownLeft}
          />
          <SettingsButton onClick={() => setSettingsOpen(true)} />
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            farmId={farmId}
            data={data}
            onLoad={load}
            loading={loading}
            error={error}
          />
        </>
      ) : null}
    </div>
  );
}
