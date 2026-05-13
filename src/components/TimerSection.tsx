import type { AggregatedTimer, Category } from "../timers/index.ts";
import { TimerCard } from "./TimerCard.tsx";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  category: Category;
  timers: AggregatedTimer[];
  now: number;
};

export function TimerSection({ category, timers, now }: Props) {
  if (timers.length === 0) return null;

  const sorted = [...timers].sort((a, b) => a.readyAt - b.readyAt);
  const totalCount = sorted.reduce((acc, t) => acc + t.count, 0);

  return (
    <InnerPanel className="mb-2 flex w-full break-inside-avoid flex-col gap-2">
      <header>
        <Label type="default">
          {category} · {totalCount}
        </Label>
      </header>
      <div className="flex flex-col gap-2">
        {sorted.map((t) => (
          <TimerCard key={t.id} timer={t} now={now} />
        ))}
      </div>
    </InnerPanel>
  );
}
