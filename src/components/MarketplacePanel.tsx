import {
  getBudImage,
  getItemIcon,
  ITEM_NAMES,
  KNOWN_ITEMS,
} from "../game/index.ts";
import { useMarketplaceActivity } from "../hooks/useCommunityData.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { formatRefreshedAgo } from "../lib/relativeTime.ts";
import { MARKETPLACE_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  now: number;
};

const MAX_ROWS = 8;

type Row = {
  key: string;
  name: string;
  icon: string;
  volume: number;
  trades: number;
  latestSale?: number;
  low?: number;
  high?: number;
};

/**
 * Resolve one `items` key into something renderable.
 *
 * Upstream keys each item `{collection}-{itemId}` (see `getItemKey` in
 * the BE's marketplaceActivity), so turning it back into a name means
 * inverting the same id maps the game uses — `KNOWN_ITEMS` for
 * collectibles, `ITEM_NAMES` for wearables. Buds and pets are NFTs with
 * no name table, so they're labelled by id. Player-economy keys
 * (`economies-…`) carry a slug rather than a game item and are dropped
 * by the caller.
 */
function resolve(key: string): { name: string; icon: string } | null {
  const dash = key.lastIndexOf("-");
  if (dash === -1) return null;
  const collection = key.slice(0, dash);
  const id = Number(key.slice(dash + 1));
  if (!Number.isFinite(id)) return null;

  switch (collection) {
    case "collectibles": {
      const name = KNOWN_ITEMS[id];
      return name ? { name, icon: getItemIcon(name) } : null;
    }
    case "wearables": {
      const name = ITEM_NAMES[id];
      return name ? { name, icon: getItemIcon(name) } : null;
    }
    case "buds":
      return { name: `Bud #${id}`, icon: getBudImage(id) };
    case "pets":
      return { name: `Pet #${id}`, icon: "" };
    default:
      // `economies-{slug}-{id}` and anything upstream adds later.
      return null;
  }
}

/**
 * Today's marketplace trading activity, from
 * `/community/data?type=marketplaceActivity`.
 *
 * The report is farm-independent — it's the whole market, not the
 * player's own trades — so it sits on /farm as standing context rather
 * than anywhere in the timer flow. Prices are per-unit FLOWER, as
 * upstream computes them.
 *
 * Self-hides before the day's batch job has written anything, which is
 * the normal state for the first minutes after UTC midnight.
 */
export function MarketplacePanel({ now }: Props) {
  const state = useMarketplaceActivity();

  if (state.status !== "ready") return null;

  const { flowerPrice, reports } = state.value.data;

  // Exactly one report comes back per request; take it without
  // assuming today's date string matches the viewer's timezone.
  const entry = Object.entries(reports)[0];
  if (!entry) return null;
  const [date, report] = entry;

  const rows: Row[] = Object.entries(report.items ?? {})
    .flatMap(([key, stats]) => {
      const resolved = resolve(key);
      if (!resolved) return [];
      return [{ key, ...resolved, ...stats }];
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, MAX_ROWS);

  const totals = report.totals;
  if (!totals && rows.length === 0) return null;

  return (
    <InnerPanel
      id={MARKETPLACE_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 break-inside-avoid flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default" icon={CHROME_ICONS.trade}>
          Marketplace
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
              style={{ imageRendering: "pixelated" }}
            />
            <span className="tabular-nums">{formatYield(totals.volume)}</span>
            <span className="text-xxs opacity-60">{`volume`}</span>
          </span>
          <span className="text-xxs flex items-center gap-2 opacity-70">
            <span className="tabular-nums">{`${totals.trades} trades`}</span>
            {flowerPrice > 0 ? (
              <span className="tabular-nums">{`$${flowerPrice.toFixed(3)}/FLOWER`}</span>
            ) : null}
          </span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-xs opacity-60">No trades recorded yet today.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {row.icon ? (
                  <img
                    src={row.icon}
                    alt=""
                    aria-hidden
                    className="h-5 w-5 shrink-0 object-contain"
                    style={{ imageRendering: "pixelated" }}
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
                    style={{ imageRendering: "pixelated" }}
                  />
                  {formatYield(row.latestSale ?? row.high ?? 0)}
                </span>
                <span className="text-xxs whitespace-nowrap tabular-nums opacity-60">
                  {row.low !== undefined && row.high !== undefined
                    ? `${formatYield(row.low)}–${formatYield(row.high)} · `
                    : ""}
                  {`${row.trades}×`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </InnerPanel>
  );
}
