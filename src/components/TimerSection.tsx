import type { AggregatedTimer, Category } from "../timers/index.ts";
import { getCategoryIcon } from "./categoryIcon.ts";
import { sectionId } from "./sectionId.ts";
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
  "Fire Pit": "Not cooking",
  "Smoothie Shack": "Not cooking",
  Deli: "Not cooking",
  Kitchen: "Not cooking",
  Bakery: "Not cooking",
  "Fish Market": "Not processing",
  Composters: "No composters placed",
  "Aging Rack": "No fish aging",
  "Fermentation Rack": "Not fermenting",
  "Spice Rack": "Not spicing",
  "Crafting Box": "Nothing crafting",
  Resources: "No resources placed",
  Salt: "No salt nodes placed",
};

export function TimerSection({ category, timers, now }: Props) {
  // Idle entries (placed-but-not-producing sources like an empty
  // Kitchen) sort to the bottom regardless of `readyAt`.
  const sorted = [...timers].sort((a, b) => {
    const idleDiff = Number(!!a.idle) - Number(!!b.idle);
    if (idleDiff !== 0) return idleDiff;
    return a.readyAt - b.readyAt;
  });
  const totalCount = sorted.reduce((acc, t) => acc + t.count, 0);
  const isEmpty = sorted.length === 0;

  return (
    <InnerPanel
      id={sectionId(category)}
      // `scroll-mt-*` offsets the anchored scroll target so the mobile
      // nav strip doesn't cover the section header when we jump to it.
      className="mb-2 flex w-full scroll-mt-4 break-inside-avoid flex-col gap-2"
    >
      <header>
        <Label type="default" icon={getCategoryIcon(category)}>
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
