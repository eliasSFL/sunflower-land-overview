import { collectReady, type AggregatedTimer } from "../timers/index.ts";
import { formatYield } from "../lib/format.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { getCategoryIcon } from "./categoryIcon.ts";
import { COLLECT_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

// The Now page's headline panel: one global "everything that's ready to
// collect", aggregated across every category and grouped by where it
// lives on the farm. Answers the dashboard's most-frequent question —
// "what can I grab right now?" — in one glance, instead of scanning a
// flat per-category list. Renders nothing when nothing is ready.
export function CollectNowPanel({
  timers,
  now,
}: {
  timers: AggregatedTimer[];
  now: number;
}) {
  const { groups, total } = collectReady(timers, now);
  if (total === 0) return null;

  return (
    <InnerPanel id={COLLECT_SECTION_ID} className="scroll-mt-4">
      <div className="mb-2 flex items-center gap-2">
        <img
          src={CHROME_ICONS.chest}
          alt=""
          aria-hidden
          className="h-9 w-9 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-base">{total} ready to collect</span>
          <span className="text-xs">
            across {groups.length} {groups.length === 1 ? "part" : "parts"} of
            your farm
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <InnerPanel
            key={group.category}
            className="flex flex-col gap-1"
            style={{ background: "#e9c39c" }}
          >
            <Label type="default" icon={getCategoryIcon(group.category)}>
              {group.category} · {group.items.length}
            </Label>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.key} className="flex items-center gap-2 min-w-0">
                  {item.icon ? (
                    <img
                      src={item.icon}
                      alt=""
                      aria-hidden
                      className="h-6 w-6 shrink-0 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null}
                  <span className="text-xs truncate">
                    {item.amount > 0
                      ? `${formatYield(item.amount)} ${item.label}`
                      : item.label}
                  </span>
                </li>
              ))}
            </ul>
          </InnerPanel>
        ))}
      </div>
    </InnerPanel>
  );
}
