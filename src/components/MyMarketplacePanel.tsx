import { useMemo } from "react";

import type { MarketplaceProfileData } from "../api/communityData.ts";
import { getObjectEntries } from "../game/index.ts";
import { useMarketplaceProfile } from "../hooks/useCommunityData.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { tradeDirection } from "../lib/trades.ts";
import { MY_MARKET_SECTION_ID } from "./sectionId.ts";
import { marketItemIcon, resolveTradeItem } from "./marketplaceItems.ts";
import { InnerPanel, Label } from "./ui/index.ts";

// This farm's own marketplace standing, from `type=marketplaceProfile`.
//
// Everything the market panels above show is the world's; this is the
// half that is actually yours — what you have open right now, what the
// week has cost and paid, and who you keep trading with.
//
// Access-gated in the Worker (see worker/index.ts), so a farm outside
// the overview's cohort resolves to an error state. That reads the same
// as "no profile" here: the panel hides rather than explaining a
// permission model the player didn't ask about.

const MAX_TRADES = 12;

/**
 * The single item a listing/offer is for, with its quantity. Open
 * trades key `items` by NAME (unlike the activity report, which is
 * id-keyed), so the icon comes from the by-name resolver.
 */
function openTradeItem(trade: {
  items: Partial<Record<string, number>>;
}): { name: string; icon: string; quantity: number } | null {
  const [entry] = getObjectEntries(trade.items);
  if (!entry) return null;
  const [name, quantity] = entry;
  return {
    name: String(name),
    icon: marketItemIcon(String(name)),
    quantity: Number(quantity ?? 0),
  };
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1 text-sm tabular-nums">
        {icon ? (
          <img
            src={icon}
            alt=""
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 object-contain"
          />
        ) : null}
        <span className="truncate">{value}</span>
      </span>
      <span className="text-xxs opacity-60">{label}</span>
    </div>
  );
}

function OpenTrades({
  title,
  trades,
}: {
  title: string;
  trades: MarketplaceProfileData["listings"] | MarketplaceProfileData["offers"];
}) {
  const entries = Object.entries(trades ?? {});
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xxs opacity-60">{`${title} (${entries.length})`}</span>
      <ul className="flex flex-col gap-0.5">
        {entries.slice(0, 8).map(([id, trade]) => {
          const item = openTradeItem(trade);
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">
                {item ? `${item.quantity}× ${item.name}` : "—"}
              </span>
              <span className="flex shrink-0 items-center gap-1 tabular-nums">
                <img
                  src={CHROME_ICONS.flower_token}
                  alt=""
                  aria-hidden
                  className="h-3 w-3 shrink-0 object-contain"
                />
                {formatYield(trade.sfl)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MyMarketplacePanel({ farmId }: { farmId: number | undefined }) {
  const state = useMarketplaceProfile(farmId);
  const profile = state.status === "ready" ? state.value.data : undefined;

  const trades = useMemo(() => {
    if (!profile) return [];
    return profile.trades.slice(0, MAX_TRADES).map((trade) => ({
      trade,
      ...tradeDirection(trade, profile.id),
      item: resolveTradeItem(trade.collection, trade.itemId),
    }));
  }, [profile]);

  if (!profile) return null;

  const weekNet = profile.weeklyFlowerEarned - profile.weeklyFlowerSpent;

  return (
    <InnerPanel
      id={MY_MARKET_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default" icon={CHROME_ICONS.player}>
          Your trading
        </Label>
        <span className="text-xxs truncate opacity-60">{profile.username}</span>
      </header>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <Stat label="lifetime trades" value={String(profile.totalTrades)} />
        <Stat
          label="lifetime profit"
          value={formatYield(profile.profit)}
          icon={CHROME_ICONS.flower_token}
        />
        <Stat
          label="earned this week"
          value={formatYield(profile.weeklyFlowerEarned)}
          icon={CHROME_ICONS.flower_token}
        />
        <Stat
          label="spent this week"
          value={formatYield(profile.weeklyFlowerSpent)}
          icon={CHROME_ICONS.flower_token}
        />
      </div>

      <div className="text-xxs opacity-70">
        {/* Net is derived rather than reported — say so plainly rather
            than presenting it as another upstream figure. */}
        {`Net this week: ${weekNet >= 0 ? "+" : ""}${formatYield(weekNet)} FLOWER`}
      </div>

      <OpenTrades title="Your listings" trades={profile.listings} />
      <OpenTrades title="Your offers" trades={profile.offers} />

      {profile.friends.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xxs opacity-60">Most traded with</span>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {profile.friends.map((friend) => (
              <li key={friend.id} className="text-xs">
                <span className="truncate">{friend.username}</span>
                <span className="text-xxs opacity-60">{` ${friend.trades}×`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {trades.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xxs opacity-60">Recent trades</span>
          <ul className="flex flex-col gap-0.5">
            {trades.map(({ trade, sold, counterparty, item }) => (
              <li
                key={trade.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {/* Direction is a word, never colour alone. */}
                  <span
                    className={`text-xxs shrink-0 ${sold ? "opacity-80" : "opacity-60"}`}
                  >
                    {sold ? "SOLD" : "BOUGHT"}
                  </span>
                  {item?.icon ? (
                    <img
                      src={item.icon}
                      alt=""
                      aria-hidden
                      className="h-4 w-4 shrink-0 object-contain"
                    />
                  ) : null}
                  <span className="truncate">
                    {`${trade.quantity}× ${item?.name ?? `#${trade.itemId}`}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <span className="text-xxs max-w-20 truncate opacity-60">
                    {counterparty.username ?? `#${counterparty.id}`}
                  </span>
                  <img
                    src={CHROME_ICONS.flower_token}
                    alt=""
                    aria-hidden
                    className="h-3 w-3 shrink-0 object-contain"
                  />
                  {formatYield(trade.sfl)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </InnerPanel>
  );
}
