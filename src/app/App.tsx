import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { NavMenu } from "../components/NavMenu.tsx";
import { PageNavMenu } from "../components/PageNavMenu.tsx";
import { RefreshButton } from "../components/RefreshButton.tsx";
import { SettingsButton } from "../components/SettingsButton.tsx";
import { SettingsModal } from "../components/SettingsModal.tsx";
import { OuterPanel } from "../components/ui/index.ts";
import { useFarmData, REFRESH_COOLDOWN_MS } from "../hooks/useFarmData.ts";
import { useFarmNavSections } from "../hooks/useFarmNavSections.ts";
import { useNavSections } from "../hooks/useNavSections.ts";
import { useNow } from "../hooks/useNow.ts";
import { useQuestsNavSections } from "../hooks/useQuestsNavSections.ts";
import { useHudActivity } from "../hooks/useHudActivity.ts";
import {
  usePanelArrangement,
  type PanelSheet,
} from "../hooks/usePanelArrangement.ts";
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
import { NowPage } from "./NowPage.tsx";
import { PanelGridPage } from "./PanelGridPage.tsx";
import { sortByArrangement } from "./panelOrder.ts";
import {
  buildFarmPanels,
  buildProducingPanels,
  buildQuestsPanels,
  FARM_PAGE_KEY,
  PRODUCING_PAGE_KEY,
  QUESTS_PAGE_KEY,
} from "./panelRegistry.tsx";
import {
  DIGGING_PATH,
  FARM_PATH,
  LEGACY_INFO_PATH,
  LEGACY_TIMERS_PATH,
  NOW_PATH,
  PRODUCING_PATH,
  QUESTS_PATH,
} from "./routes.ts";

// Bespoke pages (Now, Digging) have no arrangeable flow, so their
// Settings → Layout sub-screen must edit nothing. This neutral sheet
// renders an empty arrange list and no-ops every mutation — without it
// the Layout screen would fall back to another page's arrangement and
// silently reorder it.
const NEUTRAL_SHEET: PanelSheet = {
  items: [],
  reorderVisible: () => {},
  toggleHidden: () => {},
  reset: () => {},
};

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

  // Resolve each arrangeable page's panel list into reorderable
  // descriptors, then run the per-page arrangement (persisted order +
  // hidden set). The pages render `renderPanels`; the Settings → Layout
  // sub-screen drives the same arrangement, so board and grid share one
  // source of truth. Built unconditionally (empty list pre-load) to keep
  // the hooks order stable. The Now and Digging pages are bespoke and
  // have no arrangement.
  const producingPanels = useMemo(
    () =>
      data
        ? buildProducingPanels({ data, byCategory, visibleCategories, now })
        : [],
    [data, byCategory, visibleCategories, now],
  );
  const questsPanels = useMemo(
    () => (data ? buildQuestsPanels({ data, now }) : []),
    [data, now],
  );
  const farmPanels = useMemo(
    () => (data ? buildFarmPanels({ data, now }) : []),
    [data, now],
  );
  const producingArrangement = usePanelArrangement(
    PRODUCING_PAGE_KEY,
    producingPanels,
  );
  const questsArrangement = usePanelArrangement(QUESTS_PAGE_KEY, questsPanels);
  const farmArrangement = usePanelArrangement(FARM_PAGE_KEY, farmPanels);

  const producingNavSections = useNavSections({ visibleCategories });
  const questsNavSections = useQuestsNavSections(now);
  const farmNavSections = useFarmNavSections();
  // Keep each page's mobile jump-nav order in step with its board
  // arrangement.
  const orderedProducingNav = useMemo(
    () =>
      sortByArrangement(
        producingNavSections,
        producingArrangement.orderedLiveIds,
      ),
    [producingNavSections, producingArrangement.orderedLiveIds],
  );
  const orderedQuestsNav = useMemo(
    () =>
      sortByArrangement(questsNavSections, questsArrangement.orderedLiveIds),
    [questsNavSections, questsArrangement.orderedLiveIds],
  );
  const orderedFarmNav = useMemo(
    () => sortByArrangement(farmNavSections, farmArrangement.orderedLiveIds),
    [farmNavSections, farmArrangement.orderedLiveIds],
  );
  // Auto-hide the floating HUD buttons on mobile after the user stops
  // interacting (scroll OR tap). Desktop always shows them — each
  // button overrides the hidden translate at `sm+`.
  const hudVisible = useHudActivity();

  const cooldownLeft =
    lastFetchedAt !== undefined
      ? Math.max(0, REFRESH_COOLDOWN_MS - (now - lastFetchedAt))
      : 0;

  const onNowRoute = pathname === NOW_PATH;
  const onProducingRoute = pathname === PRODUCING_PATH;
  const onQuestsRoute = pathname === QUESTS_PATH;
  const onFarmRoute = pathname === FARM_PATH;
  const onDiggingRoute = pathname === DIGGING_PATH;

  // Subtitle is route-aware once a farm has loaded. Pre-load it's a
  // tab-agnostic default while the FarmIdPanel is the whole screen.
  const subtitle = !data
    ? "Live timers for your farm"
    : onNowRoute
      ? "What's ready, and what's next"
      : onProducingRoute
        ? "Everything that's mid-timer"
        : onQuestsRoute
          ? "Deliveries, chores & bounties"
          : onDiggingRoute
            ? "Read the sand & crabs — dig the sure things"
            : "Your farm at a glance";

  // The NavMenu (mobile section-jump) mounts only on the arrangeable
  // pages — the bespoke Now and Digging pages have no jump sections.
  const navSections = onProducingRoute
    ? orderedProducingNav
    : onQuestsRoute
      ? orderedQuestsNav
      : onFarmRoute
        ? orderedFarmNav
        : [];

  // The Layout sub-screen arranges whichever arrangeable page is in
  // view; bespoke pages hand it the neutral (empty, no-op) sheet.
  const activeSheet = onProducingRoute
    ? producingArrangement.sheet
    : onQuestsRoute
      ? questsArrangement.sheet
      : onFarmRoute
        ? farmArrangement.sheet
        : NEUTRAL_SHEET;

  return (
    <div className="min-h-dvh bg-[#181425]">
      <OuterPanel className="min-h-dvh">
        <DashboardHeader
          data={data}
          lastFetchedAt={lastFetchedAt}
          now={now}
          subtitle={subtitle}
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
            {/* Page switching lives entirely in the PageNavMenu FAB
                (bottom-right HUD stack) on every breakpoint — see below. */}
            <Routes>
              <Route
                path={NOW_PATH}
                element={
                  <NowPage
                    data={data}
                    timers={timers}
                    byCategory={byCategory}
                    now={now}
                  />
                }
              />
              <Route
                path={PRODUCING_PATH}
                element={
                  <PanelGridPage panels={producingArrangement.renderPanels} />
                }
              />
              <Route
                path={QUESTS_PATH}
                element={
                  <PanelGridPage panels={questsArrangement.renderPanels} />
                }
              />
              <Route
                path={FARM_PATH}
                element={
                  <PanelGridPage panels={farmArrangement.renderPanels} />
                }
              />
              <Route
                path={DIGGING_PATH}
                element={<DiggingPage data={data} now={now} />}
              />
              {/* Legacy two-page paths redirect to their action-scheme
                  home so old bookmarks / shared links still land. */}
              <Route
                path={LEGACY_TIMERS_PATH}
                element={<Navigate to={PRODUCING_PATH} replace />}
              />
              <Route
                path={LEGACY_INFO_PATH}
                element={<Navigate to={FARM_PATH} replace />}
              />
              {/* Root and any unknown path bounce to /now — the primary
                surface. `replace` so back-button doesn't ping-pong
                through the redirect. */}
              <Route path="*" element={<Navigate to={NOW_PATH} replace />} />
            </Routes>
          </>
        )}
      </OuterPanel>
      {/* Section-jump FAB + slide-up sheet. Each route feeds its own
          candidate list; NavMenu filters by DOM existence at open time.
          Mobile-only (NavMenu is `sm:hidden` internally). Bespoke pages
          (Now, Digging) have no jump sections, so it doesn't mount. */}
      {data && navSections.length > 0 ? (
        <NavMenu sections={navSections} visible={hudVisible} />
      ) : null}
      {data ? (
        <>
          {/* Page-switch FAB — mounts on every route (including the
              bespoke pages, so it's how you leave them) and every
              breakpoint. */}
          <PageNavMenu visible={hudVisible} />
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
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            farmId={farmId}
            data={data}
            onLoad={load}
            loading={loading}
            error={error}
            sheet={activeSheet}
            lastFetchedAt={lastFetchedAt}
            now={now}
          />
        </>
      ) : null}
    </div>
  );
}
