import { useMemo } from "react";
import Decimal from "decimal.js-light";

import {
  generateDeliveryTickets,
  getBoostIcon,
  getBoostLabel,
  getChapterTicket,
  getItemIcon,
  getObjectEntries,
  getOrderSellPrice,
  isCollectible,
  isTicketNPC,
  type BoostName,
  type GameState,
  type Order,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { NPCIcon } from "./NPCIcon.tsx";
import { getActiveDeliveryGroups } from "./deliveryGroups.ts";
import {
  DELIVERIES_COINS_SECTION_ID,
  DELIVERIES_FLOWER_SECTION_ID,
  DELIVERIES_TICKETS_SECTION_ID,
} from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

// Split the active-orders list into one panel per reward currency.
// Each panel is a collapsible <details> so the player can fold the
// noisier groups (tickets tends to have the most entries on a mature
// farm) while keeping the headline counts visible.
export function DeliveriesPanel({ state, now }: Props) {
  const grouped = useMemo(
    () => getActiveDeliveryGroups(state, now),
    [state, now],
  );
  const total =
    grouped.coins.length + grouped.sfl.length + grouped.tickets.length;
  if (total === 0) return null;

  const ticketIcon = getItemIcon(getChapterTicket(now));

  return (
    <>
      <DeliveryGroupPanel
        id={DELIVERIES_COINS_SECTION_ID}
        title="Coin"
        icon={CHROME_ICONS.coins}
        orders={grouped.coins}
        state={state}
        now={now}
      />
      <DeliveryGroupPanel
        id={DELIVERIES_FLOWER_SECTION_ID}
        title="FLOWER"
        icon={CHROME_ICONS.flower_token}
        orders={grouped.sfl}
        state={state}
        now={now}
      />
      <DeliveryGroupPanel
        id={DELIVERIES_TICKETS_SECTION_ID}
        title={getChapterTicket(now)}
        icon={ticketIcon}
        orders={grouped.tickets}
        state={state}
        now={now}
      />
    </>
  );
}

type GroupProps = {
  id: string;
  title: string;
  icon: string;
  orders: Order[];
  state: GameState;
  now: number;
};

function DeliveryGroupPanel({
  id,
  title,
  icon,
  orders,
  state,
  now,
}: GroupProps) {
  if (orders.length === 0) return null;
  return (
    <InnerPanel
      id={id}
      className="scroll-mt-4 flex flex-col gap-2 break-inside-auto! box-decoration-clone"
    >
      <Label type="default" icon={icon}>
        {title} Deliveries · {orders.length}
      </Label>
      <ul className="flex flex-col gap-2">
        {orders.map((order) => (
          <DeliveryRow key={order.id} order={order} state={state} now={now} />
        ))}
      </ul>
    </InnerPanel>
  );
}

type RowProps = { order: Order; state: GameState; now: number };

function DeliveryRow({ order, state, now }: RowProps) {
  // `items` is a sparse record — typically a single key for one
  // required item, but the upstream type allows multiple.
  const itemEntries = getObjectEntries(order.items);
  const isCompleted = !!order.completedAt;
  // Order ingredients can be regular inventory items (Crimstone, Sunflower)
  // or one of two currency keys ("coins", "sfl") that live on top-level
  // GameState fields with their own icons.
  const ingredients = itemEntries.map(([name, rawRequired]) => {
    // `order.items` is a sparse Partial — for keys present here the
    // value is a number, so a missing entry is a malformed save. Default
    // to 0 so the UI degrades gracefully rather than rendering NaN.
    const required = rawRequired ?? 0;
    let have: number;
    let icon: string;
    if (name === "coins") {
      have = state.coins;
      icon = CHROME_ICONS.coins;
    } else if (name === "sfl") {
      have = state.balance.toNumber();
      icon = CHROME_ICONS.flower_token;
    } else if (isCollectible(name)) {
      have = state.inventory[name]?.toNumber() ?? 0;
      icon = getItemIcon(name);
    } else {
      have = state.wardrobe[name] ?? 0;
      icon = getItemIcon(name);
    }
    return { name, required, have, icon, met: have >= required };
  });
  const allMet = ingredients.every((i) => i.met);

  return (
    <li className="flex items-start justify-between gap-3 break-inside-avoid">
      <div className="flex items-start gap-2 min-w-0">
        <NPCIcon npc={order.from} />
        <div className="flex flex-col min-w-0 gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm capitalize">{order.from}</span>
            {isCompleted ? (
              <img
                src={CHROME_ICONS.confirm}
                alt="Completed"
                title="Completed"
                className="h-4 w-4 shrink-0 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : allMet ? (
              <img
                src={CHROME_ICONS.expression_alerted}
                alt="Ready to deliver"
                title="Ready to deliver"
                className="h-4 w-4 shrink-0 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
          </div>
          {ingredients.map(({ name, required, have, icon, met }) => (
            <span
              key={name}
              className="flex items-center gap-1 text-xs min-w-0"
              style={{
                color: isCompleted || met ? undefined : "#e43b44",
                opacity: isCompleted ? 0.6 : 0.9,
              }}
            >
              <img
                src={icon}
                alt=""
                aria-hidden
                className="h-4 w-4 shrink-0 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="truncate">
                {isCompleted
                  ? `${formatYield(required)} ${name}`
                  : `${formatYield(have)}/${formatYield(required)} ${name}`}
              </span>
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
  const rewardItems = getObjectEntries(order.reward.items ?? {});

  let coinAmount: number | undefined;
  let sflAmount: number | undefined;
  let boostsUsed: { name: BoostName; value: string }[] = [];
  if (order.reward.coins) {
    const { reward, boostsUsed: bu } = getOrderSellPrice<number>(
      state,
      order,
      new Date(now),
    );
    coinAmount = reward;
    boostsUsed = bu;
  } else if (order.reward.sfl) {
    const { reward, boostsUsed: bu } = getOrderSellPrice<Decimal>(
      state,
      order,
      new Date(now),
    );
    sflAmount = reward.toNumber();
    boostsUsed = bu;
  }

  const npc = order.from;
  const ticketResult = isTicketNPC(npc)
    ? generateDeliveryTickets({ game: state, npc, now })
    : { amount: 0, boostsUsed: [] };
  const ticketAmount = ticketResult.amount;
  if (ticketAmount > 0) boostsUsed = boostsUsed.concat(ticketResult.boostsUsed);
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
      {rewardItems.map(([name, amount]) => {
        if (!amount) return null;
        return (
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
        );
      })}
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
      {boostsUsed.length > 0 ? (
        <ul className="mt-0.5 flex flex-col items-end gap-0.5 opacity-80">
          {boostsUsed.map((b, i) => (
            <li
              key={`${b.name}:${i}`}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              <img
                src={getBoostIcon(b.name, state)}
                alt=""
                aria-hidden
                className="h-4 w-4 shrink-0 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="truncate max-w-30" title={getBoostLabel(b.name)}>
                {getBoostLabel(b.name)}
              </span>
              <span className="shrink-0 tabular-nums">{b.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
