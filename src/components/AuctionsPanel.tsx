import { getItemIcon, getObjectEntries, type Auction } from "../game/index.ts";
import { useAuctions } from "../hooks/useCommunityData.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { AUCTIONS_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  now: number;
};

// How far ahead to list. The auction calendar upstream covers a whole
// chapter, so without a horizon this panel becomes a wall of items
// weeks out — which isn't what the dashboard is for.
const UPCOMING_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 6;

// What's being auctioned, as a name + icon. NFT auctions carry a type
// ("Pet") rather than a specific item, so there's no sprite to show —
// upstream doesn't resolve one until the NFT is revealed.
function describe(auction: Auction): { name: string; icon: string } {
  if (auction.type === "collectible") {
    return {
      name: auction.collectible,
      icon: getItemIcon(auction.collectible),
    };
  }
  if (auction.type === "wearable") {
    return { name: auction.wearable, icon: getItemIcon(auction.wearable) };
  }
  return { name: `${auction.nft} NFT`, icon: "" };
}

/**
 * Auction house schedule, from `/community/data?type=auctions`.
 *
 * Shows what is open for bids right now and what opens next, with the
 * bid cost and how many are on offer. Deliberately not a full auction
 * browser: closed auctions and their results are a separate lookup
 * (`type=auctionResults`) and belong in the game, not here.
 *
 * Self-hides when nothing is live or near, matching the other
 * event-window panels (Love Island shop, village projects).
 */
export function AuctionsPanel({ now }: Props) {
  const state = useAuctions();

  if (state.status !== "ready") return null;

  const { auctions, totalSupply } = state.value.data;

  const relevant = auctions
    .filter((a) => a.endAt > now && a.startAt < now + UPCOMING_HORIZON_MS)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, MAX_ROWS);

  if (relevant.length === 0) return null;

  return (
    <InnerPanel
      id={AUCTIONS_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 break-inside-avoid flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default" icon={CHROME_ICONS.auctioneer}>
          Auctions
        </Label>
        {state.value.stale ? (
          <span
            className="text-xxs opacity-60"
            title="Upstream was unavailable; showing the last data we have."
          >
            {`cached`}
          </span>
        ) : null}
      </header>

      <ul className="flex flex-col gap-2">
        {relevant.map((auction) => {
          const live = auction.startAt <= now;
          const { name, icon } = describe(auction);
          const ingredients = getObjectEntries(auction.ingredients ?? {});
          const max = totalSupply[name];

          return (
            <li
              key={auction.auctionId}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {icon ? (
                  <img
                    src={icon}
                    alt=""
                    aria-hidden
                    className="h-5 w-5 shrink-0 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : null}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{name}</span>
                  <span className="text-xxs flex items-center gap-1 opacity-60">
                    {`${auction.supply} on offer`}
                    {max ? ` · ${max} max supply` : ""}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span
                  className="text-xs whitespace-nowrap tabular-nums"
                  style={{ color: live ? "#e43b44" : undefined }}
                >
                  {live
                    ? `closes in ${formatRemaining(auction.endAt - now)}`
                    : `opens in ${formatRemaining(auction.startAt - now)}`}
                </span>
                <span className="text-xxs flex items-center gap-1 whitespace-nowrap opacity-70">
                  {auction.sfl > 0 ? (
                    <>
                      <img
                        src={CHROME_ICONS.flower_token}
                        alt=""
                        aria-hidden
                        className="h-3 w-3 shrink-0 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                      {formatYield(auction.sfl)}
                    </>
                  ) : null}
                  {ingredients.map(([item, amount]) => (
                    <span key={item} className="flex items-center gap-0.5">
                      <img
                        src={getItemIcon(item)}
                        alt=""
                        aria-hidden
                        className="h-3 w-3 shrink-0 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                      {formatYield(amount ?? 0)}
                    </span>
                  ))}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </InnerPanel>
  );
}
