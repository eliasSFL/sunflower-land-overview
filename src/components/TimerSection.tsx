import type { AggregatedTimer, Category } from "../timers/index.ts";
import { TimerCard } from "./TimerCard.tsx";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  category: Category;
  timers: AggregatedTimer[];
  now: number;
};

// Per-category placeholder for when there's nothing active. Shown
// inside the panel so the layout stays stable across refreshes — a
// crop you just harvested doesn't make the whole Crops panel vanish.
const EMPTY_MESSAGES: Record<Category, string> = {
  Crops: "No crops planted",
  "Fruit Patches": "No fruit planted",
  Greenhouse: "No greenhouse crops planted",
  "Crop Machine": "Crop machine idle",
  Flowers: "No flowers planted",
  Beehives: "No active beehives",
  Animals: "No animals",
  Resources: "No resources placed",
  Salt: "No salt nodes placed",
  "Lava Pits": "No active lava pits",
};

export function TimerSection({ category, timers, now }: Props) {
  const sorted = [...timers].sort((a, b) => a.readyAt - b.readyAt);
  const totalCount = sorted.reduce((acc, t) => acc + t.count, 0);
  const isEmpty = sorted.length === 0;

  return (
    <InnerPanel className="mb-2 flex w-full break-inside-avoid flex-col gap-2">
      <header>
        <Label type="default">
          {category}
          {isEmpty ? "" : ` · ${totalCount}`}
        </Label>
      </header>
      {isEmpty ? (
        <p className="text-sm">{EMPTY_MESSAGES[category]}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((t) => (
            <TimerCard key={t.id} timer={t} now={now} />
          ))}
        </div>
      )}
    </InnerPanel>
  );
}
