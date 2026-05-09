import type { Timer } from "../lib/timers";
import { TimerCard } from "./TimerCard";

type Props = {
  category: string;
  timers: Timer[];
  now: number;
};

export function TimerSection({ category, timers, now }: Props) {
  const readyCount = timers.filter((t) => t.readyAt - now <= 0).length;
  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-muted]">
          {category}
        </h2>
        <span className="text-xs text-[--color-muted]">
          {readyCount > 0
            ? `${readyCount} ready · ${timers.length} total`
            : `${timers.length} total`}
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
