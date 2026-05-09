import type { AggregatedTimer } from "../lib/timers";
import { formatAbsolute, formatRemaining, statusFor } from "../lib/format";

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

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          <span className="truncate font-medium">
            {timer.count > 1 && (
              <span className="text-[--color-muted] font-mono mr-1.5">
                {timer.count}×
              </span>
            )}
            {timer.label}
          </span>
        </div>
        {hasRange && (
          <div className="ml-4 text-xs text-[--color-muted] truncate">
            all ready in {formatRemaining(timer.latestReadyAt - now)}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono text-sm ${style.text}`}>
          {timer.isDeadline && earliestRemaining > 0
            ? `in ${formatRemaining(earliestRemaining)}`
            : formatRemaining(earliestRemaining)}
        </div>
        <div className="text-[11px] text-[--color-muted]">
          {formatAbsolute(timer.earliestReadyAt)}
        </div>
      </div>
    </li>
  );
}
