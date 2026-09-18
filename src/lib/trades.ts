import type { MarketplaceSale } from "../api/communityData.ts";

// Pure reading of a fulfilled trade record. Kept out of the panel so
// the direction rule — the one genuinely easy-to-invert piece of logic
// on the marketplace page — can be tested without rendering anything.

export type TradeSide = {
  /** True when the farm in question was the seller. */
  sold: boolean;
  /** The other party. */
  counterparty: { id: number; username?: string };
};

/**
 * Which side of a trade a farm was on.
 *
 * Upstream records two parties and a source: `initiatedBy` posted the
 * trade, `fulfilledBy` took it, and `source` says which kind of trade it
 * started as. Those two facts have to be combined — neither alone says
 * who paid:
 *
 *   - a LISTING is someone offering to sell, so its initiator SOLD and
 *     whoever fulfilled it BOUGHT;
 *   - an OFFER is someone bidding to buy, so its initiator BOUGHT and
 *     whoever fulfilled it SOLD.
 *
 * Reading `initiatedBy` alone would label every offer backwards.
 */
export function tradeDirection(
  trade: Pick<MarketplaceSale, "initiatedBy" | "fulfilledBy" | "source">,
  farmId: number,
): TradeSide {
  const initiated = trade.initiatedBy.id === farmId;
  return {
    sold: trade.source === "listing" ? initiated : !initiated,
    counterparty: initiated ? trade.fulfilledBy : trade.initiatedBy,
  };
}

/**
 * Per-unit price of an open trade. A bulk listing's `sfl` is the price
 * for the whole lot, so comparing lots by `sfl` alone ranks a cheap
 * single unit below an expensive bundle. Quantity is clamped to 1 so a
 * malformed zero-quantity record can't divide by zero.
 */
export function unitPrice(trade: { sfl: number; quantity: number }): number {
  return trade.sfl / Math.max(1, trade.quantity);
}
