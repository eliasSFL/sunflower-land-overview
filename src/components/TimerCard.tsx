import type { AggregatedTimer } from "../timers/index.ts";
import { statusOf } from "../timers/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatReadyAt, formatRemaining, formatYield } from "../lib/format.ts";
import { Label } from "./ui/index.ts";

const CHEVRON_DOWN = CHROME_ICONS.chevron_down;

type Props = {
  timer: AggregatedTimer;
  now: number;
};

type LabelType = "success" | "warning" | "info" | "default";

const STATUS_LABEL: Record<ReturnType<typeof statusOf>, LabelType> = {
  ready: "success",
  soon: "warning",
  later: "info",
};

export function TimerCard({ timer, now }: Props) {
  const status = statusOf(timer.readyAt, now);
  const remaining = formatRemaining(timer.readyAt - now);
  const yieldAmount = timer.predictedYield?.amount ?? 0;
  const item = timer.predictedYield?.item ?? timer.label;
  const slots = timer.slots ?? [];
  const hasSlots = slots.length > 0;

  let headline =
    yieldAmount > 0
      ? `${formatYield(yieldAmount)} ${item}`
      : timer.count > 1 && !hasSlots
        ? `${timer.count}× ${timer.label}`
        : timer.label;
  if (timer.progressPercent !== undefined) {
    headline += ` · ${Math.floor(timer.progressPercent)}%`;
  }

  const boosts = timer.boosts ?? [];
  const hasBoosts = boosts.length > 0;

  const row = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {timer.icon ? (
          <img
            src={timer.icon}
            alt=""
            className="h-8 w-8 shrink-0 object-contain"
            aria-hidden
          />
        ) : null}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm truncate">{headline}</span>
            {hasBoosts ? (
              <img
                src={CHEVRON_DOWN}
                alt=""
                aria-hidden
                title="Click to see boosts"
                className="h-auto w-6 shrink-0 transition-transform group-open:rotate-180"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
          </div>
          {timer.bonus || timer.subtext ? (
            <div className="mt-0.5 flex items-center gap-2 min-w-0">
              {timer.bonus ? (
                <Label
                  type={timer.bonus.type ?? "success"}
                  icon={timer.bonus.icon}
                >
                  {timer.bonus.label}
                </Label>
              ) : null}
              {timer.subtext ? (
                <span className="text-xs opacity-60 truncate">
                  {timer.subtext}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {timer.idle ? (
          timer.idleLabelType ? (
            <Label type={timer.idleLabelType}>{timer.idleText ?? "Idle"}</Label>
          ) : (
            <span className="text-xs opacity-60 whitespace-nowrap">
              {timer.idleText ?? "Idle"}
            </span>
          )
        ) : (
          <>
            <Label type={STATUS_LABEL[status]}>{remaining}</Label>
            {status !== "ready" ? (
              <span className="text-xs opacity-60 whitespace-nowrap">
                {formatReadyAt(timer.readyAt, now)}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  // Cooking-style cards: one row per queue slot, each with its own
  // item + amount + ready time. Slots that have their own boost list
  // wrap in a nested <details> so the player can drill into a
  // specific slot's boosts without losing the rest of the queue.
  const slotList = hasSlots ? (
    <ul className="mt-1 ml-10 flex flex-col gap-0.5 text-xs">
      {slots.map((slot, i) => {
        const slotStatus = statusOf(slot.readyAt, now);
        const slotBoosts = slot.boosts ?? [];
        const slotHasBoosts = slotBoosts.length > 0;
        const slotRow = (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 min-w-0">
              {slot.icon ? (
                <img
                  src={slot.icon}
                  alt=""
                  className="h-4 w-4 shrink-0 object-contain"
                  aria-hidden
                />
              ) : null}
              <span className="truncate">
                {formatYield(slot.amount)} {slot.item}
              </span>
              {slotHasBoosts ? (
                <img
                  src={CHEVRON_DOWN}
                  alt=""
                  aria-hidden
                  title="Click to see boosts"
                  className="h-auto w-4 shrink-0 transition-transform group-open:rotate-180"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : null}
            </span>
            <Label type={STATUS_LABEL[slotStatus]}>
              {formatRemaining(slot.readyAt - now)}
            </Label>
          </div>
        );

        if (!slotHasBoosts) {
          return <li key={`${slot.item}:${i}`}>{slotRow}</li>;
        }

        return (
          <li key={`${slot.item}:${i}`}>
            <details className="group">
              <summary className="list-none cursor-pointer marker:hidden">
                {slotRow}
              </summary>
              <ul className="mt-0.5 ml-5 space-y-0.5 opacity-80">
                {slotBoosts.map((b, j) => (
                  <li
                    key={`${b.name}:${b.value}:${j}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1 min-w-0">
                      {b.icon ? (
                        <img
                          src={b.icon}
                          alt=""
                          className="h-4 w-4 shrink-0 object-contain"
                          aria-hidden
                        />
                      ) : null}
                      <span className="truncate">{b.label ?? b.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{b.value}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  ) : null;

  const boostsList = hasBoosts ? (
    <ul className="mt-1 ml-10 space-y-0.5 text-xs opacity-80">
      {boosts.map((b, i) => (
        <li
          key={`${b.name}:${b.value}:${i}`}
          className="flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-1 min-w-0">
            {b.icon ? (
              <img
                src={b.icon}
                alt=""
                className="h-4 w-4 shrink-0 object-contain"
                aria-hidden
              />
            ) : null}
            <span className="truncate">{b.label ?? b.name}</span>
          </span>
          <span className="shrink-0 tabular-nums">
            {b.value}
            <span className="opacity-60"> ×{b.count}</span>
          </span>
        </li>
      ))}
    </ul>
  ) : null;

  if (!hasBoosts && !hasSlots) return row;

  // Slots always visible; boosts stay in the collapsible <details>.
  if (!hasBoosts) {
    return (
      <div>
        {row}
        {slotList}
      </div>
    );
  }

  return (
    <details className="group">
      <summary className="list-none cursor-pointer marker:hidden">
        {row}
      </summary>
      {slotList}
      {boostsList}
    </details>
  );
}
