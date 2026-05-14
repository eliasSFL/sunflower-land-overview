import { useMemo, useRef, useState } from "react";

import { BumpkinSummaryPanel } from "../components/BumpkinSummaryPanel.tsx";
import { DeliveriesPanel } from "../components/DeliveriesPanel.tsx";
import { getActiveDeliveryGroups } from "../components/deliveryGroups.ts";
import { FarmIdForm } from "../components/FarmIdForm.tsx";
import { MobileNav, type NavSection } from "../components/MobileNav.tsx";
import { NextUpPanel } from "../components/NextUpPanel.tsx";
import { TimerSection } from "../components/TimerSection.tsx";
import { getCategoryIcon } from "../components/categoryIcon.ts";
import {
  BUMPKIN_SECTION_ID,
  DELIVERIES_COINS_SECTION_ID,
  DELIVERIES_FLOWER_SECTION_ID,
  DELIVERIES_TICKETS_SECTION_ID,
  NEXT_UP_SECTION_ID,
  sectionId,
} from "../components/sectionId.ts";
import { Label, OuterPanel, InnerPanel } from "../components/ui/index.ts";
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
import * as storage from "../lib/storage.ts";

const GITHUB_REPO =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined) ??
  "eliasSFL/sunflower-land-overview";

const FARM_ID_KEY = "sfl-overview:farm-id";
const API_KEY_KEY = "sfl-overview:api-key";
const REFRESH_COOLDOWN_MS = 60_000;

const BANNER_URL = BANNER_URLS.marketplace;

export function App() {
  const [farmId, setFarmId] = useState<string>(
    () => storage.load<string>(FARM_ID_KEY) ?? "",
  );
  const [apiKey, setApiKey] = useState<string>(
    () => storage.load<string>(API_KEY_KEY) ?? "",
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

  const inFlightRef = useRef<Promise<void> | undefined>(undefined);

  const now = useNow(1000);

  const load = async (id: string, key: string) => {
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
        const resp = await fetchFarm(id, key);
        setData(resp);
        setFarmId(id);
        setApiKey(key);
        storage.save(FARM_ID_KEY, id);
        storage.save(API_KEY_KEY, key);
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
    const out: NavSection[] = [
      {
        id: BUMPKIN_SECTION_ID,
        label: "Bumpkin",
        icon: CHROME_ICONS.level_up,
      },
    ];
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
  }, [data, now, visibleCategories]);

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

        {/* Layout proportions across breakpoints (12-col grid). "Total
            cols" counts the Farm ID column too:
            <sm   : 1 col total  (mobile, full-width stack)
            sm    : 2 cols total — Farm ID 5/12 + right 7/12, 1 timer col
            lg    : 3 cols total — Farm ID 4/12 + right 8/12, 2 timer cols
            2xl+  : 4 cols total — Farm ID 3/12 + right 9/12, 3 timer cols
            Right-side uses CSS multi-column flow (see below). */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          {/* Left column — Farm ID form + Next Up widget stacked. The
              wrapping div carries the col-span / self-start so both
              panels share the column width and the stack collapses to
              its content height instead of stretching to the timer
              column on the right. */}
          <div className="flex flex-col gap-2 self-start sm:col-span-5 lg:col-span-4 2xl:col-span-3">
            <InnerPanel className="flex flex-col gap-3">
              <p className="text-sm">
                In the game:{" "}
                <strong>
                  {"Settings > Advanced > Developer Options > API Key"}
                </strong>{" "}
                to generate your key. Both fields are stored locally on your
                device.
              </p>
              <FarmIdForm
                initialFarmId={farmId}
                initialApiKey={apiKey}
                onSubmit={load}
                loading={loading}
                lastLoaded={data ? { farmId, apiKey } : undefined}
                cooldownLeftMs={cooldownLeft}
              />
              {data ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Label type="default">Farm #{data.id}</Label>
                  {data.nft_id || data.nftId ? (
                    <Label type="info">NFT {data.nft_id ?? data.nftId}</Label>
                  ) : null}
                  {data.isBlacklisted ? (
                    <Label type="danger">blacklisted</Label>
                  ) : null}
                </div>
              ) : null}
              {data && lastFetchedAt ? (
                <span className="text-xs">
                  last refreshed {new Date(lastFetchedAt).toLocaleTimeString()}
                </span>
              ) : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </InnerPanel>
            {data ? <BumpkinSummaryPanel data={data} /> : null}
            {data ? <NextUpPanel timers={timers} now={now} /> : null}
            {data ? <DeliveriesPanel state={data.farm} now={now} /> : null}
          </div>

          {data ? (
            // CSS multi-column layout (not grid) so a short panel under a
            // tall one stacks immediately in the same column instead of
            // leaving an empty grid-row gap. Timer-column count is fixed
            // by breakpoint so panel width stays proportional with the
            // Farm ID column:
            //   <lg     : 1 timer col (mobile, full-width stack)
            //   lg-2xl  : 2 timer cols (Farm + 2 = 3 total)
            //   2xl+    : 3 timer cols (Farm + 3 = 4 total)
            // Adding more timer panels just makes existing columns
            // taller — no breakpoint maintenance needed.
            <div className="columns-1 gap-2 sm:col-span-7 lg:col-span-8 lg:columns-2 2xl:col-span-9 2xl:columns-3">
              {visibleCategories.map((cat) => (
                <TimerSection
                  key={cat}
                  category={cat}
                  timers={byCategory.get(cat) ?? []}
                  now={now}
                />
              ))}
            </div>
          ) : null}
        </div>
        {/* Extra bottom padding on `<lg` so the fixed MobileNav strip
            doesn't cover the last section. */}
        <div className="h-16 lg:hidden" aria-hidden />
      </OuterPanel>
      {data ? <MobileNav sections={navSections} /> : null}
    </div>
  );
}
