import type { AggregatedTimer } from "../lib/timers";
import { TimerCard } from "./TimerCard";

type Props = {
  category: string;
  id: string;
  timers: AggregatedTimer[];
  now: number;
};

export function TimerSection({ category, id, timers, now }: Props) {
  const readyItems = timers.reduce(
    (sum, t) => (t.earliestReadyAt - now <= 0 ? sum + t.count : sum),
    0,
  );
  const totalItems = timers.reduce((sum, t) => sum + t.count, 0);

  return (
    // scroll-mt accounts for the sticky header on small screens so the
    // section title isn't tucked under the bar after a jump.
    <section id={id} className="scroll-mt-20 space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-muted]">
          {category}
        </h2>
        <span className="text-xs text-[--color-muted]">
          {readyItems > 0
            ? `${readyItems} ready · ${totalItems} total`
            : `${totalItems} total`}
        </span>
      </header>
      <ul className="space-y-2">
        {timers.map((t) => (
          <TimerCard key={t.key} timer={t} now={now} />
        ))}
      </ul>
    </section>
  );
}
