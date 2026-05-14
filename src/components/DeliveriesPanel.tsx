import { useMemo } from "react";
import Decimal from "decimal.js-light";

import {
  generateDeliveryTickets,
  getChapterTicket,
  getItemIcon,
  getOrderSellPrice,
  isTicketNPC,
  type GameState,
  type NPCName,
  type Order,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { NPCIcon } from "./NPCIcon.tsx";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

type Bucket = "coins" | "sfl" | "tickets";

// Split the active-orders list into one panel per reward currency.
// Each panel is a collapsible <details> so the player can fold the
// noisier groups (tickets tends to have the most entries on a mature
// farm) while keeping the headline counts visible.
export function DeliveriesPanel({ state, now }: Props) {
  const orders = useMemo(() => {
    const all = (state.delivery?.orders ?? []) as Order[];
    return all
      .filter((o) => !o.completedAt && now >= o.readyAt)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [state, now]);

  const grouped = useMemo(() => {
    const out: Record<Bucket, Order[]> = { coins: [], sfl: [], tickets: [] };
    for (const order of orders) {
      out[bucketFor(order)].push(order);
    }
    return out;
  }, [orders]);

  if (orders.length === 0) return null;

  const ticketIcon = getItemIcon(getChapterTicket(now));

  return (
    <>
      <DeliveryGroupPanel
        title="Coins"
        icon={CHROME_ICONS.coins}
        orders={grouped.coins}
        state={state}
        now={now}
      />
      <DeliveryGroupPanel
        title="FLOWER"
        icon={CHROME_ICONS.flower_token}
        orders={grouped.sfl}
        state={state}
        now={now}
      />
      <DeliveryGroupPanel
        title="Tickets"
        icon={ticketIcon}
        orders={grouped.tickets}
        state={state}
        now={now}
      />
    </>
  );
}

// Coin / SFL is decided by the stored reward; tickets are inferred from
// the NPC since the reward isn't on the order. Anything else (e.g. a
// special-event NPC paying raw items) falls back to the ticket bucket
// so it still surfaces rather than getting dropped.
function bucketFor(order: Order): Bucket {
  if (order.reward.coins) return "coins";
  if (order.reward.sfl) return "sfl";
  return "tickets";
}

type GroupProps = {
  title: string;
  icon: string;
  orders: Order[];
  state: GameState;
  now: number;
};

function DeliveryGroupPanel({ title, icon, orders, state, now }: GroupProps) {
  if (orders.length === 0) return null;
  return (
    <InnerPanel>
      <details open className="group flex flex-col gap-2">
        <summary className="list-none cursor-pointer marker:hidden">
          <div className="flex items-center justify-between gap-2">
            <Label type="default" icon={icon}>
              {title} · {orders.length}
            </Label>
            <img
              src={CHROME_ICONS.chevron_down}
              alt=""
              aria-hidden
              title="Click to collapse / expand"
              className="h-auto w-6 shrink-0 transition-transform group-open:rotate-180"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </summary>
        <ul className="mt-2 flex flex-col gap-2">
          {orders.map((order) => (
            <DeliveryRow key={order.id} order={order} state={state} now={now} />
          ))}
        </ul>
      </details>
    </InnerPanel>
  );
}

type RowProps = { order: Order; state: GameState; now: number };

function DeliveryRow({ order, state, now }: RowProps) {
  // `items` is a sparse record — typically a single key for one
  // required item, but the upstream type allows multiple.
  const itemEntries = Object.entries(order.items) as [string, number][];

  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <NPCIcon npc={order.from as NPCName} />
        <div className="flex flex-col min-w-0">
          <span className="text-sm truncate capitalize">{order.from}</span>
          {itemEntries.map(([name, amount]) => (
            <span key={name} className="text-xs opacity-80 truncate">
              {formatYield(amount)} {name}
            </span>
          ))}
        </div>
      </div>
      <DeliveryReward order={order} state={state} now={now} />
    </li>
  );
}

function DeliveryReward({ order, state, now }: RowProps) {
  // Coin / SFL rewards: boost-adjusted via `getOrderSellPrice`.
  // Ticket NPCs don't store the reward on the order — upstream
  // computes it at claim time from VIP, chapter boost items, and the
  // Double Delivery calendar event. Call `generateDeliveryTickets`
  // ourselves and render the current chapter's token icon.
  const rewardItems = Object.entries(order.reward.items ?? {}) as [
    string,
    number,
  ][];

  let coinAmount: number | undefined;
  let sflAmount: number | undefined;
  if (order.reward.coins) {
    const { reward } = getOrderSellPrice<number>(state, order, new Date(now));
    coinAmount = reward;
  } else if (order.reward.sfl) {
    const { reward } = getOrderSellPrice<Decimal>(state, order, new Date(now));
    sflAmount = reward.toNumber();
  }

  const npc = order.from as NPCName;
  const ticketAmount = isTicketNPC(npc)
    ? generateDeliveryTickets({ game: state, npc, now })
    : 0;
  const ticketName = ticketAmount > 0 ? getChapterTicket(now) : undefined;

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs">
      {coinAmount !== undefined ? (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <img
            src={CHROME_ICONS.coins}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          {formatYield(coinAmount)}
        </span>
      ) : null}
      {sflAmount !== undefined ? (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <img
            src={CHROME_ICONS.flower_token}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          {formatYield(sflAmount)}
        </span>
      ) : null}
      {rewardItems.map(([name, amount]) => (
        <span
          key={name}
          className="flex items-center gap-1 whitespace-nowrap"
        >
          <img
            src={getItemIcon(name)}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          {formatYield(amount)}
        </span>
      ))}
      {ticketName ? (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <img
            src={getItemIcon(ticketName)}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          {formatYield(ticketAmount)}
        </span>
      ) : null}
    </div>
  );
}
