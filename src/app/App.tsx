import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { NavMenu } from "../components/NavMenu.tsx";
import { RefreshButton } from "../components/RefreshButton.tsx";
import { SettingsButton } from "../components/SettingsButton.tsx";
import { SettingsModal } from "../components/SettingsModal.tsx";
import { TabPills } from "../components/TabPills.tsx";
import { OuterPanel } from "../components/ui/index.ts";
import { useFarmData, REFRESH_COOLDOWN_MS } from "../hooks/useFarmData.ts";
import { useFarmInfoNavSections } from "../hooks/useFarmInfoNavSections.ts";
import { useNavSections } from "../hooks/useNavSections.ts";
import { useNow } from "../hooks/useNow.ts";
import { useHudActivity } from "../hooks/useHudActivity.ts";
import { usePanelArrangement } from "../hooks/usePanelArrangement.ts";
import { usePushSubscriptionChangeSync } from "../notifications/usePushSubscriptionChangeSync.ts";
import {
  extractAndAggregate,
  CATEGORY_ORDER,
  PLACEMENT_GATED_CATEGORIES,
  EVENT_GATED_CATEGORIES,
} from "../timers/index.ts";
import { DashboardHeader } from "./DashboardHeader.tsx";
import { DiggingPage } from "./DiggingPage.tsx";
import { FarmIdPanel } from "./FarmIdPanel.tsx";
import { FarmInfoPage } from "./FarmInfoPage.tsx";
import { LiveTimersPage } from "./LiveTimersPage.tsx";
import { sortByArrangement } from "./panelOrder.ts";
import {
  buildInfoPanels,
  buildTimersPanels,
  INFO_PAGE_KEY,
  TIMERS_PAGE_KEY,
} from "./panelRegistry.tsx";
import { DIGGING_PATH, INFO_PATH, TABS, TIMERS_PATH } from "./routes.ts";

// Resets `window.scrollTo(0)` whenever the route changes. Mounted
// inside the router so `useLocation` works. Standard SPA pattern;
// react-router-dom v7 doesn't ship one out-of-the-box.
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTopOnNavigate />
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const { farmId, data, loading, error, accessDenied, lastFetchedAt, load } =
    useFarmData();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Freeze the clock while Settings is open: the modal covers the
  // countdowns, and pausing the per-second timer recompute keeps the main
  // thread free so dragging panels in the Layout sub-screen stays smooth.
  const now = useNow(1000, !settingsOpen);

  usePushSubscriptionChangeSync(data?.id);

  const timers = useMemo(() => {
    if (!data) return [];
    const id = data.id ?? (Number(farmId) || 0);
    // Drop `pushOnly` timers from the dashboard list. They exist so the
    // worker can schedule a headsup push (Love Island "closing soon"
    // 5 min before endAt) without doubling up on the existing
    // dashboard countdown. The worker re-runs `extractAndAggregate`
    // itself and is unfiltered, so the push still schedules.
    return extractAndAggregate(data.farm, id, now).filter((t) => !t.pushOnly);
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

  // Resolve each page's panel list into reorderable descriptors, then run
  // the per-page arrangement (persisted order + hidden set). The pages
  // render `renderPanels`; the Settings → Layout sub-screen (LayoutPanelGrid)
  // drives the same arrangement, so board and grid share one source of truth.
  // Built unconditionally (empty list pre-load) to keep the hooks order stable.
  const timersPanels = useMemo(
    () =>
      data
        ? buildTimersPanels({ data, byCategory, visibleCategories, now })
        : [],
    [data, byCategory, visibleCategories, now],
  );
  const infoPanels = useMemo(
    () => (data ? buildInfoPanels({ data, now }) : []),
    [data, now],
  );
  const timersArrangement = usePanelArrangement(TIMERS_PAGE_KEY, timersPanels);
  const infoArrangement = usePanelArrangement(INFO_PAGE_KEY, infoPanels);

  const navSections = useNavSections({
    data,
    timers,
    byCategory,
    visibleCategories,
    now,
  });
  const infoNavSections = useFarmInfoNavSections(now);
  // Keep the mobile jump-nav order in step with the board arrangement.
  const orderedNavSections = useMemo(
    () => sortByArrangement(navSections, timersArrangement.orderedLiveIds),
    [navSections, timersArrangement.orderedLiveIds],
  );
  const orderedInfoNavSections = useMemo(
    () => sortByArrangement(infoNavSections, infoArrangement.orderedLiveIds),
    [infoNavSections, infoArrangement.orderedLiveIds],
  );
  // Auto-hide the floating HUD buttons on mobile after the user stops
  // interacting (scroll OR tap). Desktop always shows them — each
  // button overrides the hidden translate at `sm+`.
  const hudVisible = useHudActivity();

  const cooldownLeft =
    lastFetchedAt !== undefined
      ? Math.max(0, REFRESH_COOLDOWN_MS - (now - lastFetchedAt))
      : 0;

  // Tabs only mount once a farm has loaded — pre-load the page is
  // dominated by the FarmIdPanel and a header subtitle ("Live timers
  // for your farm") that's tab-agnostic. Once loaded the subtitle
  // becomes route-aware.
  const onTimersRoute = pathname === TIMERS_PATH;
  const onDiggingRoute = pathname === DIGGING_PATH;
  const subtitle = !data
    ? "Live timers for your farm"
    : onTimersRoute
      ? "Live timers for your farm"
      : onDiggingRoute
        ? "Read the sand & crabs — dig the sure things"
        : "Your farm at a glance";

  return (
    <div className="min-h-dvh bg-[#181425]">
      <OuterPanel className="min-h-dvh">
        <DashboardHeader
          data={data}
          lastFetchedAt={lastFetchedAt}
          now={now}
          subtitle={subtitle}
          // Hide tabs until a farm has loaded — pre-load both routes
          // would render an empty FarmIdPanel-only shell, so the tab
          // switcher would have nothing meaningful to switch between.
          showTabs={!!data}
        />
        {!data ? (
          <FarmIdPanel
            farmId={farmId}
            accessDenied={accessDenied}
            error={error}
            loading={loading}
            onSubmit={load}
          />
        ) : (
          <>
            {/* Mobile tab pills live in the page content (sm:hidden)
                above the first panel — keeps the header chrome
                compact on phones while still putting the pills right
                where the eye is starting to scan the content. The
                desktop copy is mounted in DashboardHeader. */}
            <div className="mb-2 lg:hidden">
              <TabPills tabs={TABS} />
            </div>
            <Routes>
              <Route
                path={TIMERS_PATH}
                element={
                  <LiveTimersPage
                    panels={timersArrangement.renderPanels}
                    timers={timers}
                    now={now}
                  />
                }
              />
              <Route
                path={INFO_PATH}
                element={<FarmInfoPage panels={infoArrangement.renderPanels} />}
              />
              <Route
                path={DIGGING_PATH}
                element={<DiggingPage data={data} now={now} />}
              />
              {/* Root and any unknown path bounce to /timers — the
                primary surface. `replace` so back-button doesn't
                ping-pong through the redirect. */}
              <Route path="*" element={<Navigate to={TIMERS_PATH} replace />} />
            </Routes>
          </>
        )}
      </OuterPanel>
      {/* Section-jump FAB + slide-up sheet. Each route feeds its own
          candidate list; NavMenu filters by DOM existence at open
          time. Mobile-only (NavMenu is `sm:hidden` internally). */}
      {/* The Digging page is a single bespoke screen with no jump-nav
          sections, so the FAB only mounts on /timers and /info. */}
      {data && !onDiggingRoute ? (
        <NavMenu
          sections={onTimersRoute ? orderedNavSections : orderedInfoNavSections}
          visible={hudVisible}
        />
      ) : null}
      {data ? (
        <>
          <RefreshButton
            onClick={() => load(farmId)}
            loading={loading}
            cooldownLeftMs={cooldownLeft}
            visible={hudVisible}
          />
          <SettingsButton
            onClick={() => setSettingsOpen(true)}
            visible={hudVisible}
          />
          {/* The Layout sub-screen arranges whichever page is in view —
              both arrangements are always live; we hand the active one's
              stable `sheet` bundle (not the whole arrangement) so the
              drag list stays off the 1 Hz re-render path. */}
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            farmId={farmId}
            data={data}
            onLoad={load}
            loading={loading}
            error={error}
            sheet={
              onTimersRoute ? timersArrangement.sheet : infoArrangement.sheet
            }
            lastFetchedAt={lastFetchedAt}
            now={now}
          />
        </>
      ) : null}
    </div>
  );
}
