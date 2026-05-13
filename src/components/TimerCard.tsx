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

  let headline =
    yieldAmount > 0
      ? `${formatYield(yieldAmount)} ${item}`
      : timer.count > 1
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
                className="h-auto w-[24px] shrink-0 transition-transform group-open:rotate-180"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
          </div>
          {timer.subtext ? (
            <span className="text-xs opacity-60 truncate">
              {timer.subtext}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <Label type={STATUS_LABEL[status]}>{remaining}</Label>
        {status !== "ready" ? (
          <span className="text-xs opacity-60 whitespace-nowrap">
            {formatReadyAt(timer.readyAt, now)}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!hasBoosts) return row;

  return (
    <details className="group">
      <summary className="list-none cursor-pointer marker:hidden">
        {row}
      </summary>
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
              {b.count > 1 ? (
                <span className="opacity-60"> ×{b.count}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
