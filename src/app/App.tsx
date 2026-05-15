import { useEffect, useMemo, useRef, useState } from "react";

import { BumpkinSummaryPanel } from "../components/BumpkinSummaryPanel.tsx";
import { DeliveriesPanel } from "../components/DeliveriesPanel.tsx";
import { getActiveDeliveryGroups } from "../components/deliveryGroups.ts";
import { FarmIdForm } from "../components/FarmIdForm.tsx";
import { MobileNav, type NavSection } from "../components/MobileNav.tsx";
import { NextUpPanel, ReadyPanel } from "../components/NextUpPanel.tsx";
import { RefreshButton } from "../components/RefreshButton.tsx";
import { SettingsButton } from "../components/SettingsButton.tsx";
import { SettingsModal } from "../components/SettingsModal.tsx";
import { TimerSection } from "../components/TimerSection.tsx";
import { getCategoryIcon } from "../components/categoryIcon.ts";
import {
  BUMPKIN_SECTION_ID,
  DELIVERIES_COINS_SECTION_ID,
  DELIVERIES_FLOWER_SECTION_ID,
  DELIVERIES_TICKETS_SECTION_ID,
  NEXT_UP_SECTION_ID,
  READY_SECTION_ID,
  sectionId,
} from "../components/sectionId.ts";
import { OuterPanel, InnerPanel } from "../components/ui/index.ts";
import { getChapterTicket, getItemIcon } from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import {
  fetchFarm,
  loadCachedFarm,
  ApiError,
  type FarmResponse,
} from "../api/fetchFarm.ts";
import { useNow } from "../hooks/useNow.ts";
import { useVersionCheck } from "../hooks/useVersionCheck.ts";
import {
  extractAndAggregate,
  CATEGORY_ORDER,
  COOKING_BUILDING_CATEGORIES,
} from "../timers/index.ts";
import { BANNER_URLS } from "../lib/assets.ts";
import { pullDoSnapshot } from "../notifications/snapshot.ts";
import * as storage from "../lib/storage.ts";

const GITHUB_REPO =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined) ??
  "eliasSFL/sunflower-land-overview";

const FARM_ID_KEY = "sfl-overview:farm-id";
const REFRESH_COOLDOWN_MS = 60_000;

const BANNER_URL = BANNER_URLS.marketplace;

export function App() {
  const [farmId, setFarmId] = useState<string>(
    () => storage.load<string>(FARM_ID_KEY) ?? "",
  );
  // Seed from the localStorage cache so a reload paints the farm
  // immediately. The `fetchedAt` stamp keeps the "last refreshed" label
  // truthful across sessions and respects the refresh cooldown.
  const initialCache = useMemo(() => {
    const id = storage.load<string>(FARM_ID_KEY);
    return id ? loadCachedFarm(id) : undefined;
    // Run once on mount — deps left empty intentionally.
  }, []);
  const [data, setData] = useState<FarmResponse | undefined>(
    () => initialCache?.data,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastFetchedAt, setLastFetchedAt] = useState<number | undefined>(
    () => initialCache?.fetchedAt,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const inFlightRef = useRef<Promise<void> | undefined>(undefined);

  const now = useNow(1000);

  // On mount: if we have a cached farm, ask the DO whether it's seen
  // a newer snapshot since the cache's `at` timestamp. The Coordinator
  // updates DO state every 10 min regardless of whether the PWA was
  // open, so this catches state changes the player made in the main
  // game while the overview was closed.
  useEffect(() => {
    if (!initialCache || !data) return;
    let cancelled = false;
    (async () => {
      const fresher = await pullDoSnapshot(data.id, initialCache.fetchedAt);
      if (cancelled || !fresher) return;
      // Re-load from localStorage so makeGame() runs over the freshly-
      // written payload — keeps Decimal hydration logic in one place.
      const reloaded = loadCachedFarm(data.id);
      if (reloaded) {
        setData(reloaded.data);
        setLastFetchedAt(reloaded.fetchedAt);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount — `initialCache` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: string) => {
    if (inFlightRef.current) return inFlightRef.current;
    if (
      lastFetchedAt &&
      Date.now() - lastFetchedAt < REFRESH_COOLDOWN_MS &&
      id === farmId
    ) {
      return;
    }
    setLoading(true);
    setError(undefined);
    const p = (async () => {
      try {
        const resp = await fetchFarm(id);
        setData(resp);
        setFarmId(id);
        storage.save(FARM_ID_KEY, id);
        setLastFetchedAt(Date.now());
      } catch (e) {
        if (e instanceof ApiError) {
          setError(`${e.status} — ${e.message}`);
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Unknown error");
        }
      } finally {
        setLoading(false);
        inFlightRef.current = undefined;
      }
    })();
    inFlightRef.current = p;
    return p;
  };

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

  // Cooking buildings only show up if the player has actually placed
  // one — otherwise we'd render a "Smoothie Shack: Not cooking" panel
  // (and a MobileNav chip) for a building they don't own. Other
  // categories (Crops, Animals, …) always render so the panel still
  // serves as a "you could be doing this" reminder when idle.
  const visibleCategories = useMemo(
    () =>
      CATEGORY_ORDER.filter((cat) => {
        if (COOKING_BUILDING_CATEGORIES.includes(cat)) {
          return (byCategory.get(cat) ?? []).length > 0;
        }
        return true;
      }),
    [byCategory],
  );

  // Build the MobileNav strip declaratively. Order mirrors the
  // on-page render order (left column top→bottom, then timer
  // sections). Each entry is `{ id, label, icon }`; a new panel just
  // needs its section id stamped on the panel root and a push here.
  const navSections = useMemo<NavSection[]>(() => {
    if (!data) return [];
    const out: NavSection[] = [];
    const hasReady = timers.some((t) => {
      if (t.idle) return false;
      if (t.slots && t.slots.length > 0)
        return t.slots.some((s) => s.readyAt <= now);
      return t.readyAt <= now;
    });
    if (hasReady) {
      out.push({
        id: READY_SECTION_ID,
        label: "Ready",
        icon: CHROME_ICONS.expression_alerted,
      });
    }
    out.push({
      id: BUMPKIN_SECTION_ID,
      label: "Bumpkin",
      icon: CHROME_ICONS.level_up,
    });
    out.push({
      id: NEXT_UP_SECTION_ID,
      label: "Next up",
      icon: CHROME_ICONS.timer,
    });
    const groups = getActiveDeliveryGroups(data.farm, now);
    if (groups.coins.length > 0) {
      out.push({
        id: DELIVERIES_COINS_SECTION_ID,
        label: "Coin Deliveries",
        icon: CHROME_ICONS.coins,
      });
    }
    if (groups.sfl.length > 0) {
      out.push({
        id: DELIVERIES_FLOWER_SECTION_ID,
        label: "FLOWER Deliveries",
        icon: CHROME_ICONS.flower_token,
      });
    }
    if (groups.tickets.length > 0) {
      const ticketName = getChapterTicket(now);
      out.push({
        id: DELIVERIES_TICKETS_SECTION_ID,
        label: `${ticketName} Deliveries`,
        icon: getItemIcon(ticketName),
      });
    }
    for (const cat of visibleCategories) {
      out.push({
        id: sectionId(cat),
        label: cat,
        icon: getCategoryIcon(cat),
      });
    }
    return out;
  }, [data, now, timers, visibleCategories]);

  const cooldownLeft =
    lastFetchedAt !== undefined
      ? Math.max(0, REFRESH_COOLDOWN_MS - (now - lastFetchedAt))
      : 0;

  const { bundleSha, isStale } = useVersionCheck();
  const shortSha = bundleSha.slice(0, 7);
  const commitUrl = bundleSha
    ? `https://github.com/${GITHUB_REPO}/commit/${bundleSha}`
    : `https://github.com/${GITHUB_REPO}`;

  return (
    <div className="min-h-dvh bg-[#181425]">
      <OuterPanel className="min-h-dvh">
        {/* Banner header — repeating pixel-art grass tile, mirrors the
            in-game Marketplace / Flower Dashboard chrome. */}
        <header
          className="relative mb-2 flex h-[70px] items-center justify-between rounded-sm"
          style={{
            backgroundImage: `url(${BANNER_URL})`,
            backgroundRepeat: "repeat",
            backgroundSize: "320px",
            imageRendering: "pixelated",
          }}
        >
          <div className="z-10 pl-3 sm:pl-4">
            <p className="text-base sm:text-lg text-white text-shadow">
              Sunflower Land Overview
            </p>
            <p className="text-xs text-white text-shadow">
              Live timers for your farm
            </p>
          </div>
          {/* Build hash + stale-version nag, top right. The hash links
              to its commit on GitHub; the "Refresh" prompt shows when
              the polled /version.json no longer matches the bundle's
              own VITE_COMMIT_SHA. `text-right` keeps the version /
              nag text flush to the right edge when the pixel-art font
              (text-xs ≈ 24px here) wraps onto a second line. */}
          <div className="z-10 flex flex-col items-end gap-1 pr-3 text-right sm:pr-4">
            {shortSha ? (
              <span className="text-xs text-white text-shadow">
                Version:{" "}
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted underline-offset-2 hover:opacity-80"
                  title="View this commit on GitHub"
                >
                  {shortSha}
                </a>
              </span>
            ) : null}
            {isStale ? (
              <span
                role="button"
                tabIndex={0}
                onClick={() => window.location.reload()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    window.location.reload();
                  }
                }}
                className="cursor-pointer whitespace-nowrap text-xs text-yellow-300 text-shadow underline decoration-dotted underline-offset-2 hover:opacity-80"
                title="A newer build is deployed — click to reload"
              >
                New version available · click to refresh
              </span>
            ) : null}
          </div>
        </header>

        {/* Single CSS multi-column flow containing every panel. Source
            order is FarmIdForm → Ready → BumpkinSummary → NextUp →
            Deliveries → CATEGORY_ORDER timer panels; the browser auto-balances
            heights across columns. Total column count per breakpoint:
              <sm  : 1 col (mobile, full-width stack)
              sm   : 2 cols
              lg   : 3 cols
              2xl+ : 4 cols
            Matches the pre-merge layout where the Farm ID column +
            timer columns summed to the same totals. Adding more
            panels just makes existing columns taller — no breakpoint
            maintenance needed. `break-inside-avoid` on each direct
            child keeps panels intact across column boundaries. */}
        <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
          {!data ? (
            <InnerPanel className="flex flex-col gap-3">
              <p className="text-sm">
                Enter your Farm ID to see live timers. Your ID is the number
                next to your name in the main game.
              </p>
              <FarmIdForm
                initialFarmId={farmId}
                onSubmit={load}
                loading={loading}
              />
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </InnerPanel>
          ) : null}
          {data ? <BumpkinSummaryPanel data={data} /> : null}
          {data ? <ReadyPanel timers={timers} now={now} /> : null}
          {data ? <NextUpPanel timers={timers} now={now} /> : null}
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
