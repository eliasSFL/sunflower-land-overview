import { type GameState, type Order } from "../game/index.ts";

export type DeliveryBucket = "coins" | "sfl" | "tickets";

// Same filter+sort as `features/island/delivery/components/Orders.tsx`
// — unlocked orders (ready-to-deliver + already-completed) — bucketed
// by reward currency. Completed ones still surface so the player can
// see what's already done; un-ready (locked) orders are excluded.
// Exported so App.tsx can introspect non-empty buckets when building
// the mobile nav, without re-implementing the bucketing rule.
export function getActiveDeliveryGroups(
  state: GameState,
  now: number,
): Record<DeliveryBucket, Order[]> {
  const all = (state.delivery?.orders ?? []) as Order[];
  const visible = all
    .filter((o) => o.completedAt !== undefined || now >= o.readyAt)
    .sort((a, b) => {
      // Pending first (by createdAt), completed last (by createdAt).
      const aDone = a.completedAt ? 1 : 0;
      const bDone = b.completedAt ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.createdAt - b.createdAt;
    });
  const out: Record<DeliveryBucket, Order[]> = {
    coins: [],
    sfl: [],
    tickets: [],
  };
  for (const order of visible) out[bucketFor(order)].push(order);
  return out;
}

// Coin / SFL is decided by the stored reward; tickets are inferred from
// the NPC since the reward isn't on the order. Anything else (e.g. a
// special-event NPC paying raw items) falls back to the ticket bucket
// so it still surfaces rather than getting dropped.
function bucketFor(order: Order): DeliveryBucket {
  if (order.reward.coins) return "coins";
  if (order.reward.sfl) return "sfl";
  return "tickets";
}
