import { useMemo } from "react";

import { useTradeable } from "../hooks/useCommunityData.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { unitPrice } from "../lib/trades.ts";
import { ItemHistoryChart, type HistoryDay } from "./marketCharts.tsx";
import type { MarketItem } from "./marketplaceItems.ts";
import { TRADEABLE_SECTION_ID } from "./sectionId.ts";
import { Button, InnerPanel, Label } from "./ui/index.ts";

// One item's marketplace page, from `type=tradeable` — the drill-down
// behind a row of the market table.
//
// Upstream gives seven days of sale history plus every open offer and
// listing. The history arrives keyed by date in an object, so it has to
// be sorted back into order before it can be plotted; the `dates` keys
// are `YYYY-MM-DD`, which sorts lexicographically as it does
// chronologically.

const MAX_OPEN = 6;

export function TradeableDetailPanel({
  item,
  onClose,
}: {
  item: MarketItem;
  onClose: () => void;
}) {
  const state = useTradeable(item.collection, item.id);
  const data = state.status === "ready" ? state.value.data : undefined;

  const days = useMemo<HistoryDay[]>(() => {
    const dates = data?.history?.history?.dates;
    if (!dates) return [];
    return Object.values(dates).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <InnerPanel
      id={TRADEABLE_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default" icon={item.icon || CHROME_ICONS.trade}>
          {item.name}
        </Label>
        <Button onClick={onClose} className="w-auto px-2 py-0.5 text-xs">
          Close
        </Button>
      </header>

      {state.status === "loading" ? (
        <p className="text-xs opacity-60">Loading…</p>
      ) : !data ? (
        <p className="text-xs opacity-60">No marketplace page for this item.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-sm tabular-nums">
                <img
                  src={CHROME_ICONS.flower_token}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 object-contain"
                />
                {data.floor > 0 ? formatYield(data.floor) : "—"}
              </span>
              <span className="text-xxs opacity-60">floor</span>
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-sm tabular-nums">
                <img
                  src={CHROME_ICONS.flower_token}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 object-contain"
                />
                {data.lastSalePrice > 0 ? formatYield(data.lastSalePrice) : "—"}
              </span>
              <span className="text-xxs opacity-60">last sale</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm tabular-nums">
                {data.supply !== undefined ? formatYield(data.supply) : "—"}
              </span>
              <span className="text-xxs opacity-60">supply</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm tabular-nums">
                {`${data.listingCount} / ${data.offerCount}`}
              </span>
              <span className="text-xxs opacity-60">listings / offers</span>
            </div>
          </div>

          {days.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xxs opacity-60">
                {`Daily price range, last ${days.length} days (FLOWER per unit)`}
              </span>
              <ItemHistoryChart days={days} />
              <div className="text-xxs flex justify-between opacity-60">
                <span>{days[0].date.slice(5)}</span>
                <span>{days[days.length - 1].date.slice(5)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs opacity-60">No sales in the last 7 days.</p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xxs opacity-60">
                {`Cheapest listings (${data.listingCount})`}
              </span>
              {data.listings.length === 0 ? (
                <span className="text-xs opacity-60">Nothing listed.</span>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {[...data.listings]
                    // Per-unit, so a bulk listing doesn't look cheap
                    // just because it is one trade.
                    .sort((a, b) => unitPrice(a) - unitPrice(b))
                    .slice(0, MAX_OPEN)
                    .map((listing) => (
                      <li
                        key={listing.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate">
                          {`${listing.quantity}×`}
                          <span className="opacity-60">
                            {` ${listing.listedBy?.username ?? `#${listing.listedById}`}`}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatYield(listing.sfl)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xxs opacity-60">
                {`Best offers (${data.offerCount})`}
              </span>
              {data.offers.length === 0 ? (
                <span className="text-xs opacity-60">No offers.</span>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {[...data.offers]
                    .sort((a, b) => unitPrice(b) - unitPrice(a))
                    .slice(0, MAX_OPEN)
                    .map((offer) => (
                      <li
                        key={offer.tradeId}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate">
                          {`${offer.quantity}×`}
                          <span className="opacity-60">
                            {` ${offer.offeredBy?.username ?? `#${offer.offeredById}`}`}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatYield(offer.sfl)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </InnerPanel>
  );
}
