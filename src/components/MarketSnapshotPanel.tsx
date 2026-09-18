import { useMemo } from "react";

import type {
  MarketplaceItemMarket,
  MarketplaceItemStats,
} from "../api/communityData.ts";
import {
  useMarketplaceActivity,
  useMarketplaceTrend,
} from "../hooks/useCommunityData.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { formatRefreshedAgo } from "../lib/relativeTime.ts";
import { MarketTrendChart } from "./marketCharts.tsx";
import { resolveMarketItem, type MarketItem } from "./marketplaceItems.ts";
import { MARKETPLACE_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

// The market as it stands: today's totals, a week of volume, and the
// busiest items with both what they DID (volume, trades, price range)
// and what is OPEN on them right now (floor, listings, offers, best
// offer).
//
// That second half comes from the `market` snapshot upstream already
// ships inside the same payload. It covers every item with live trades
// — including ones that haven't sold today — so the table is a union of
// the two maps rather than a walk of `items` alone: an item with a
// standing floor and no sales is exactly the one a trader wants to see.

const MAX_ROWS = 12;
const TREND_DAYS = 7;

type Row = MarketItem & {
  stats?: MarketplaceItemStats;
  market?: MarketplaceItemMarket;
  /** Sort key: today's traded volume, or 0 for a quiet-but-listed item. */
  volume: number;
};

export function MarketSnapshotPanel({
  now,
  onSelect,
  selectedKey,
}: {
  now: number;
  onSelect: (item: MarketItem) => void;
  selectedKey?: string;
}) {
  const state = useMarketplaceActivity();
  const trend = useMarketplaceTrend(TREND_DAYS);

  const report =
    state.status === "ready"
      ? Object.entries(state.value.data.reports)[0]
      : undefined;

  const rows = useMemo<Row[]>(() => {
    if (!report) return [];
    const [, data] = report;
    const keys = new Set([
      ...Object.keys(data.items ?? {}),
      ...Object.keys(data.market ?? {}),
    ]);

    return [...keys]
      .flatMap((key) => {
        const item = resolveMarketItem(key);
        if (!item) return [];
        const stats = data.items?.[key];
        const market = data.market?.[key];
        return [{ ...item, stats, market, volume: stats?.volume ?? 0 }];
      })
      .sort(
        (a, b) =>
          b.volume - a.volume ||
          // Tie-break quiet items by how much is open on them, so a
          // heavily-listed item beats one with a single stale offer.
          (b.market?.listingCount ?? 0) +
            (b.market?.offerCount ?? 0) -
            ((a.market?.listingCount ?? 0) + (a.market?.offerCount ?? 0)),
      )
      .slice(0, MAX_ROWS);
  }, [report]);

  if (state.status !== "ready" || !report) return null;

  const [date, data] = report;
  const { flowerPrice } = state.value.data;
  const totals = data.totals;
  if (!totals && rows.length === 0) return null;

  return (
    <InnerPanel
      id={MARKETPLACE_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default" icon={CHROME_ICONS.trade}>
          Market today
        </Label>
        <span className="text-xxs whitespace-nowrap opacity-60">
          {state.value.stale ? "cached · " : ""}
          {state.value.fetchedAt
            ? formatRefreshedAgo(state.value.fetchedAt, now)
            : date}
        </span>
      </header>

      {totals ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1">
            <img
              src={CHROME_ICONS.flower_token}
              alt=""
              aria-hidden
              className="h-4 w-4 shrink-0 object-contain"
            />
            <span className="tabular-nums">{formatYield(totals.volume)}</span>
            <span className="text-xxs opacity-60">volume</span>
          </span>
          <span className="text-xxs flex items-center gap-2 opacity-70">
            <span className="tabular-nums">{`${totals.trades} trades`}</span>
            {flowerPrice > 0 ? (
              <span className="tabular-nums">{`$${flowerPrice.toFixed(3)}/FLOWER`}</span>
            ) : null}
          </span>
        </div>
      ) : null}

      {trend.status === "ready" && trend.value.data.length >= 2 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xxs opacity-60">
            {`Daily volume, last ${trend.value.data.length} days (FLOWER)`}
          </span>
          <MarketTrendChart points={trend.value.data} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-xs opacity-60">No trades recorded yet today.</p>
      ) : (
        <>
          <div className="text-xxs flex items-center justify-between opacity-60">
            <span>Item</span>
            <span>Floor · last · open</span>
          </div>
          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  aria-pressed={selectedKey === row.key}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded border-0 px-1 py-0.5 text-left ${
                    selectedKey === row.key
                      ? "bg-black/15"
                      : "bg-transparent hover:bg-black/10"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    {row.icon ? (
                      <img
                        src={row.icon}
                        alt=""
                        aria-hidden
                        className="h-5 w-5 shrink-0 object-contain"
                      />
                    ) : null}
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="flex items-center gap-1 text-xs whitespace-nowrap tabular-nums">
                      <img
                        src={CHROME_ICONS.flower_token}
                        alt=""
                        aria-hidden
                        className="h-3 w-3 shrink-0 object-contain"
                      />
                      {row.market?.floor !== undefined
                        ? formatYield(row.market.floor)
                        : "—"}
                      <span className="opacity-60">
                        {row.stats?.latestSale !== undefined
                          ? `· ${formatYield(row.stats.latestSale)}`
                          : ""}
                      </span>
                    </span>
                    <span className="text-xxs whitespace-nowrap tabular-nums opacity-60">
                      {`${row.market?.listingCount ?? 0} listed · ${row.market?.offerCount ?? 0} offers`}
                      {row.stats ? ` · ${row.stats.trades}×` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xxs opacity-50">
            Floor is the cheapest open listing; last is today&apos;s most recent
            sale. Tap an item for its history.
          </p>
        </>
      )}
    </InnerPanel>
  );
}
