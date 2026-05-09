import type { Timer } from "../lib/timers";
import { formatAbsolute, formatRemaining, statusFor } from "../lib/format";

type Props = { timer: Timer; now: number };

const STATUS_STYLES: Record<
  ReturnType<typeof statusFor>,
  { dot: string; text: string }
> = {
  ready: { dot: "bg-green-500", text: "text-green-700" },
  soon: { dot: "bg-amber-500", text: "text-amber-700" },
  later: { dot: "bg-blue-500", text: "text-blue-700" },
};

export function TimerCard({ timer, now }: Props) {
  const remaining = timer.readyAt - now;
  const status = statusFor(remaining);
  const style = STATUS_STYLES[status];

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          <span className="truncate font-medium">{timer.label}</span>
        </div>
        {timer.sublabel && (
          <div className="ml-4 text-xs text-[--color-muted] truncate">
            {timer.sublabel}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono text-sm ${style.text}`}>
          {timer.isDeadline && remaining > 0
            ? `in ${formatRemaining(remaining)}`
            : formatRemaining(remaining)}
        </div>
        <div className="text-[11px] text-[--color-muted]">
          {formatAbsolute(timer.readyAt)}
        </div>
      </div>
    </li>
  );
}
