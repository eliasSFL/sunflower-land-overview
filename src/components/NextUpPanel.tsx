import {
  statusOf,
  upcomingGrouped,
  type AggregatedTimer,
} from "../timers/index.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { getCategoryIcon } from "./categoryIcon.ts";
import { NEXT_UP_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

// How far ahead "Next up" reaches. Items landing further out than this
// live on the Producing page.
const WINDOW_HOURS = 4;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

// Status → Label palette: upcoming items are "soon" (warning/orange) or
// "later" (info/blue); "ready" never appears here (those land on the
// Collect panel above).
const STATUS_LABEL = {
  ready: "success",
  soon: "warning",
  later: "info",
} as const;

// The Now page's "what's about to land" roll-up. Mirrors CollectNowPanel's
// layout exactly — a chest-style hero header over a responsive grid of
// per-category InnerPanel tiles — but lists items coming ready in the next
// few hours instead of ones ready right now, and tags each row with its
// time-until-ready. Renders nothing when nothing lands in the window.
export function NextUpPanel({
  timers,
  now,
}: {
  timers: AggregatedTimer[];
  now: number;
}) {
  const { groups, total } = upcomingGrouped(timers, now, WINDOW_MS);
  if (total === 0) return null;

  return (
    <InnerPanel id={NEXT_UP_SECTION_ID} className="scroll-mt-4">
      <div className="mb-2 flex items-center gap-2">
        <img
          src={CHROME_ICONS.timer}
          alt=""
          aria-hidden
          className="h-9 w-9 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-base">{total} coming up</span>
          <span className="text-xs">in the next {WINDOW_HOURS} hours</span>
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
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-2 min-w-0"
                >
                  <span className="flex items-center gap-2 min-w-0">
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
                  </span>
                  <Label type={STATUS_LABEL[statusOf(item.readyAt, now)]}>
                    {formatRemaining(item.readyAt - now)}
                  </Label>
                </li>
              ))}
            </ul>
          </InnerPanel>
        ))}
      </div>
    </InnerPanel>
  );
}
