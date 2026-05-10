import type { AggregatedTimer } from "../timers/index.ts";
import { statusOf } from "../timers/index.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { Label } from "./sfl-ui/index.ts";

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

  const headline =
    yieldAmount > 0
      ? `${formatYield(yieldAmount)} ${item}`
      : timer.count > 1
        ? `${timer.count}× ${timer.label}`
        : timer.label;

  return (
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
        <span className="text-sm truncate">{headline}</span>
      </div>
      <Label type={STATUS_LABEL[status]}>{remaining}</Label>
    </div>
  );
}
