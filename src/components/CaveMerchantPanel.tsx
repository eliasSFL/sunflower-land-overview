import type { CSSProperties } from "react";

import {
  CAVE_MAX_TIER,
  getAvailableCaveMerchantOffers,
  getCaveMerchantOffersLeft,
  getItemIcon,
  getNextCaveTier,
  isCaveMerchantOpen,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { CAVE_MERCHANT_ICON } from "./caveMerchantIcon.ts";
import { NPCIcon } from "./NPCIcon.tsx";
import { CAVE_MERCHANT_SECTION_ID } from "./sectionId.ts";
import { pixelDarkBorderStyle } from "./ui/borderStyles.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

// Mirrors PIXEL_SCALE = 2.625 (upstream features/game/lib/constants).
const PIXEL_SCALE = 2.625;

const pixelated: CSSProperties = { imageRendering: "pixelated" };

// Gloomwick, the Goblin Cave Merchant, as upstream's CaveMerchantModal
// shows him: while he is in the Cave, the trades the Cave tier unlocks
// (pay → get, how many you're short, uses left this visit) and when he
// leaves; while he is away, when he's back. Read-only — trading happens
// in the game.
//
// The stock is rolled by the API on every farm load (`cave.merchantVisit`)
// and never predicted client-side, so there is nothing to show before the
// Cave is built or a visit has loaded.
export function CaveMerchantPanel({ state, now }: Props) {
  const cave = state.cave;
  const visit = cave?.merchantVisit;
  if (!cave || !visit) return null;

  const open = isCaveMerchantOpen(visit, now);
  const tier = cave.tier;
  const nextTier = getNextCaveTier(tier);

  // Unlocked slots, sold-out ones included (the modal greys those out
  // rather than hiding them). getAvailableCaveMerchantOffers owns the
  // open + Cave-tier gate but also drops slots with no uses left, so ask
  // it about the same Cave with no purchases recorded, then read each
  // slot's real remaining uses from getCaveMerchantOffersLeft.
  const offers = getAvailableCaveMerchantOffers(
    { ...cave, merchant: undefined },
    now,
  ).map((offer) => ({
    ...offer,
    left: getCaveMerchantOffersLeft({
      merchant: cave.merchant,
      visit: visit.index,
      slot: offer.slot,
      limit: offer.limit,
    }),
    have: state.inventory[offer.cost.item]?.toNumber() ?? 0,
  }));
  const generous = offers.length > 0 && visit.generous;

  return (
    <InnerPanel
      id={CAVE_MERCHANT_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 break-inside-avoid flex-col gap-2"
    >
      <Label type="default" icon={CAVE_MERCHANT_ICON}>
        Goblin Cave Merchant
      </Label>

      <div className="flex items-center gap-2">
        <NPCIcon npc="gloomwick" size={48} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">
            {open ? "Gloomwick is in the Cave" : "Gloomwick is away"}
          </span>
          <span className="text-xs opacity-60">
            {open
              ? "Psst... a different haul every visit. Bring it in bulk and I'll make it worth your while."
              : "Off in the deep tunnels, haggling for a fresh haul."}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {open ? (
          <>
            <Label type="info" icon={CHROME_ICONS.stopwatch}>
              Leaves in {formatRemaining(visit.closesAt - now)}
            </Label>
            <Label type="default">
              Cave tier {tier} · {offers.length} of {CAVE_MAX_TIER} offers
            </Label>
            {generous ? <Label type="warning">Generous visit</Label> : null}
          </>
        ) : (
          <AwayLabels
            nextOpensAt={visit.nextOpensAt}
            stays={visit.closesAt - visit.opensAt}
            now={now}
          />
        )}
      </div>

      {open && offers.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {offers.map((offer) => {
            const soldOut = offer.left <= 0;
            const short = offer.have < offer.cost.amount;
            return (
              <li
                key={offer.slot}
                className="flex items-center gap-2 border-t border-black/10 pt-2 first:border-0 first:pt-0"
                style={{ opacity: soldOut ? 0.7 : 1 }}
              >
                {/* The corner tag shows only the amount asked, red when you
                    have too few — the game's "have/need" doesn't fit a
                    dashboard column, and the line beside it already says
                    how many more you need. */}
                <TradeBox
                  image={getItemIcon(offer.cost.item)}
                  amount={formatYield(offer.cost.amount)}
                  short={short}
                />
                <img
                  src={CHROME_ICONS.arrow_right}
                  alt=""
                  aria-hidden
                  className="shrink-0"
                  style={{ width: `${PIXEL_SCALE * 7}px`, ...pixelated }}
                />
                <TradeBox
                  image={getItemIcon(offer.reward.item)}
                  amount={formatYield(offer.reward.amount)}
                />
                <div className="ml-2 flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="text-sm">
                    {formatYield(offer.cost.amount)} {offer.cost.item}
                  </span>
                  {short && !soldOut ? (
                    <span className="text-xs" style={{ color: "#e43b44" }}>
                      Need {formatYield(offer.cost.amount - offer.have)} more{" "}
                      {offer.cost.item}
                    </span>
                  ) : (
                    <span className="text-xs opacity-60">
                      for {formatYield(offer.reward.amount)} {offer.reward.item}
                    </span>
                  )}
                  {offer.curiosity ? (
                    <Label type="warning">Curiosity</Label>
                  ) : null}
                </div>
                <div className="shrink-0">
                  {soldOut ? (
                    <Label type="danger">Sold out</Label>
                  ) : (
                    <Label type="default">
                      {offer.left}/{offer.limit} left
                    </Label>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {open && nextTier ? (
        <Label type="default" icon={CHROME_ICONS.lock}>
          More offers at Cave tier {nextTier}
        </Label>
      ) : null}
    </InnerPanel>
  );
}

// The modal's away card: once the visit's next opening has passed he is due
// back any moment (the next farm load brings the new visit); otherwise when
// he returns, in the viewer's locale, and how long he stays.
function AwayLabels({
  nextOpensAt,
  stays,
  now,
}: {
  nextOpensAt: number;
  stays: number;
  now: number;
}) {
  const due = now >= nextOpensAt;
  const returnsAt = new Date(nextOpensAt).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <>
      <Label type="info" icon={CHROME_ICONS.stopwatch}>
        {due
          ? "Back any moment"
          : `Back in ${formatRemaining(nextOpensAt - now)}`}
      </Label>
      {due ? null : (
        <Label type="default">
          {returnsAt} · stays {formatRemaining(stays)}
        </Label>
      )}
    </>
  );
}

// Upstream's TradeBox: the item in a dark-bordered brown square with its
// amount pinned to the bottom-right corner (red when you have too few).
function TradeBox({
  image,
  amount,
  short = false,
}: {
  image: string;
  amount: string;
  short?: boolean;
}) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{
        width: `${PIXEL_SCALE * 18}px`,
        height: `${PIXEL_SCALE * 18}px`,
        background: "#b96f50",
        ...pixelDarkBorderStyle,
      }}
    >
      <img
        src={image}
        alt=""
        aria-hidden
        className="object-contain"
        style={{
          width: `${PIXEL_SCALE * 11}px`,
          height: `${PIXEL_SCALE * 11}px`,
          ...pixelated,
        }}
      />
      <Label
        type={short ? "danger" : "default"}
        className="absolute px-0.5 text-xxs whitespace-nowrap"
        style={{
          bottom: `${PIXEL_SCALE * -4}px`,
          right: `${PIXEL_SCALE * -4}px`,
        }}
      >
        {amount}
      </Label>
    </div>
  );
}
