import {
  BOUNTY_CATEGORIES,
  generateBountyCoins,
  generateBountyTicket,
  getChapterTicket,
  getItemIcon,
  getObjectEntries,
  type BountyRequest,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";

// Reward chips for a single bounty request — shared by the item-bounty
// (Poppy) and animal-bounty (grabnab) panels so the boost handling stays
// in one place. Coins are boost-adjusted by `generateBountyCoins` (the
// +50% Bountiful Bounties skill only fires for animal bounties); the
// chapter-ticket line is boosted by `generateBountyTicket`; sfl is the flat
// Obsidian-bounty field. Animal bounties never carry sfl, so that branch is
// simply inert for them.
export function BountyReward({
  bounty,
  state,
  now,
}: {
  bounty: BountyRequest;
  state: GameState;
  now: number;
}) {
  const ticket = getChapterTicket(now);
  const items = getObjectEntries(bounty.items ?? {});
  const coins = bounty.coins
    ? generateBountyCoins({ game: state, bounty }).coins
    : 0;
  const sfl = BOUNTY_CATEGORIES["Obsidian Bounties"](bounty)
    ? (bounty.sfl ?? 0)
    : 0;

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs">
      {coins ? <RewardChip icon={CHROME_ICONS.coins} amount={coins} /> : null}
      {sfl ? (
        <RewardChip icon={CHROME_ICONS.flower_token} amount={sfl} />
      ) : null}
      {items.map(([itemName, amount]) => {
        if (!amount) return null;
        // The chapter ticket reward is boosted at claim time (chapter
        // collectibles / wearables); everything else pays out as listed.
        const value =
          itemName === ticket
            ? generateBountyTicket({ game: state, bounty, now })
            : amount;
        return (
          <RewardChip
            key={itemName}
            icon={getItemIcon(itemName)}
            amount={value}
          />
        );
      })}
    </div>
  );
}

function RewardChip({ icon, amount }: { icon: string; amount: number }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <img
        src={icon}
        alt=""
        aria-hidden
        className="h-4 w-4 shrink-0 object-contain"
        style={{ imageRendering: "pixelated" }}
      />
      {formatYield(amount)}
    </span>
  );
}
