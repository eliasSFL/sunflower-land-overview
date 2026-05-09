import { useState } from "react";
import type { AggregatedTimer } from "../lib/timers";
import { formatAbsolute, formatRemaining, statusFor } from "../lib/format";
import { getIconUrl } from "../lib/icons";

type Props = { timer: AggregatedTimer; now: number };

const STATUS_STYLES: Record<
  ReturnType<typeof statusFor>,
  { dot: string; text: string }
> = {
  ready: { dot: "bg-green-500", text: "text-green-700" },
  soon: { dot: "bg-amber-500", text: "text-amber-700" },
  later: { dot: "bg-blue-500", text: "text-blue-700" },
};

export function TimerCard({ timer, now }: Props) {
  const earliestRemaining = timer.earliestReadyAt - now;
  const status = statusFor(earliestRemaining);
  const style = STATUS_STYLES[status];

  // Only show the "all ready" line when items in the group finish at
  // different times — usually they're planted/queued together and share one
  // ready time, so the extra line would just be noise.
  const hasRange =
    timer.count > 1 && timer.latestReadyAt > timer.earliestReadyAt;

  const iconUrl = getIconUrl(timer.category, timer.label);
  const [iconBroken, setIconBroken] = useState(false);
  const showIcon = iconUrl && !iconBroken;

  // Sublabels (e.g. cooking buildings, salt charge counts). Joined with " · "
  // when there's more than one — currently only Cooking can have multiple
  // (e.g. same recipe queued in Bakery + Kitchen).
  const showSublabel =
    (timer.category === "Cooking" || timer.category === "Salt Nodes") &&
    timer.sublabels.length > 0;
  const sublabelText = showSublabel ? timer.sublabels.join(" · ") : null;

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        {showIcon ? (
          <img
            src={iconUrl}
            alt=""
            // object-contain keeps the source aspect ratio inside a square
            // 28×28 box — non-square pixel art (oil barrel, ores) stays
            // un-stretched while every row still allocates the same width.
            className="h-7 w-7 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
            onError={() => setIconBroken(true)}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {showIcon && (
              <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
            )}
            <span className="truncate font-medium">
              {timer.count > 1 && (
                <span className="mr-1.5 font-mono text-[--color-muted]">
                  {timer.count}×
                </span>
              )}
              {timer.label}
            </span>
          </div>
          {sublabelText && (
            <div className="truncate text-xs text-[--color-muted]">
              {sublabelText}
            </div>
          )}
          {hasRange && (
            <div className="truncate text-xs text-[--color-muted]">
              all ready in {formatRemaining(timer.latestReadyAt - now)}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`font-mono text-sm ${style.text}`}>
          {timer.displayOverride
            ? timer.displayOverride
            : timer.isDeadline && earliestRemaining > 0
              ? `in ${formatRemaining(earliestRemaining)}`
              : formatRemaining(earliestRemaining)}
        </div>
        {!timer.displayOverride && (
          <div className="text-[11px] text-[--color-muted]">
            {formatAbsolute(timer.earliestReadyAt)}
          </div>
        )}
      </div>
    </li>
  );
}
