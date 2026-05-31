import {
  upcomingWithin,
  type AggregatedTimer,
  type FeedItem,
} from "../timers/index.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { TIMELINE_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

// How far ahead the timeline reaches.
const WINDOW_HOURS = 4;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Dot colour by urgency: within the hour reads "warm" (orange), further
// out reads "cool" (blue) — matching the soon/later Label palette.
function dotColour(msUntil: number): string {
  return msUntil <= HOUR_MS ? "#f09100" : "#1e6dd5";
}

function itemText(item: FeedItem): string {
  return item.amount > 0
    ? `${formatYield(item.amount)} ${item.label}`
    : item.label;
}

// A cluster of items that land close enough together to share a dot. We
// bucket by rounded position rather than exact `readyAt` so things that
// finish a few seconds apart (and would visually overlap) merge into one
// discoverable marker instead of hiding each other.
type Bucket = {
  // Integer percent across the track — the bucket key and render position.
  leftPct: number;
  items: FeedItem[];
  // Soonest item in the bucket drives the colour + the marker order.
  soonestMs: number;
};

function bucketItems(items: FeedItem[], now: number): Bucket[] {
  const byPct = new Map<number, Bucket>();
  for (const item of items) {
    const msUntil = item.readyAt - now;
    const leftPct = Math.round((msUntil / WINDOW_MS) * 100);
    const existing = byPct.get(leftPct);
    if (existing) {
      existing.items.push(item);
      existing.soonestMs = Math.min(existing.soonestMs, msUntil);
    } else {
      byPct.set(leftPct, { leftPct, items: [item], soonestMs: msUntil });
    }
  }
  return [...byPct.values()].sort((a, b) => a.soonestMs - b.soonestMs);
}

// The Now page's "what's coming" view: a horizontal next-4h strip where
// each upcoming harvest/cook is a dot placed by when it lands, so a wave
// of things ripening together reads as a *shape* rather than another
// scroll. Items further out than the window live on the Producing page.
// Renders nothing when nothing lands in the next 4 hours.
export function NowTimelinePanel({
  timers,
  now,
}: {
  timers: AggregatedTimer[];
  now: number;
}) {
  const items = upcomingWithin(timers, now, WINDOW_MS);
  if (items.length === 0) return null;

  const buckets = bucketItems(items, now);
  const hourMarks = Array.from({ length: WINDOW_HOURS + 1 }, (_, h) => h);

  return (
    <InnerPanel
      id={TIMELINE_SECTION_ID}
      className="flex scroll-mt-4 flex-col gap-2"
      style={{ background: "#e9c39c" }}
    >
      <Label type="default" icon={CHROME_ICONS.timer}>
        Next {WINDOW_HOURS} hours
      </Label>
      {/* The track sits in a padded box: top room for the popovers,
          bottom room for the hour labels under the gridlines. */}
      <div className="relative mx-1 mt-10 mb-7">
        <div className="relative h-3 rounded-full bg-[#3e2731]/20">
          {hourMarks.map((h) => (
            <div
              key={h}
              className="absolute -top-2 -bottom-6 w-px bg-[#3e2731]/25"
              style={{ left: `${(h / WINDOW_HOURS) * 100}%` }}
            >
              <span className="absolute -bottom-6 left-1 whitespace-nowrap text-xxs opacity-60">
                {h === 0 ? "now" : `+${h}h`}
              </span>
            </div>
          ))}
          {buckets.map((bucket) => {
            const count = bucket.items.length;
            // The marker is a real <button> so keyboard and touch users
            // can reach the details — the popover opens on hover AND on
            // focus (group-focus), not hover alone.
            const label =
              count === 1
                ? `${itemText(bucket.items[0])} — ${formatRemaining(bucket.soonestMs)}`
                : `${count} items ready in ${formatRemaining(bucket.soonestMs)}`;
            return (
              <button
                key={bucket.leftPct}
                type="button"
                aria-label={label}
                title={label}
                className="group absolute top-1/2 z-[2] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-[#3e2731] p-0 hover:z-[5] focus:z-[5] focus:outline-none"
                style={{
                  left: `${bucket.leftPct}%`,
                  background: dotColour(bucket.soonestMs),
                }}
              >
                {count > 1 ? (
                  <span className="text-xxs leading-none text-white">
                    {count}
                  </span>
                ) : null}
                <span className="pointer-events-none absolute bottom-5 left-1/2 hidden max-w-40 -translate-x-1/2 flex-col items-start gap-0.5 rounded-sm border-2 border-[#3e2731] bg-[#fff3e0] px-1.5 py-1 group-hover:flex group-focus:flex">
                  {count > 1 ? (
                    <span className="text-xxs font-semibold whitespace-nowrap">
                      {count} ready in {formatRemaining(bucket.soonestMs)}
                    </span>
                  ) : null}
                  {bucket.items.map((item) => (
                    <span
                      key={item.key}
                      className="flex items-center gap-1 text-xxs"
                    >
                      {item.icon ? (
                        <img
                          src={item.icon}
                          alt=""
                          aria-hidden
                          className="h-4 w-4 shrink-0 object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : null}
                      <span className="truncate">{itemText(item)}</span>
                      {count === 1 ? (
                        <span className="opacity-60 whitespace-nowrap">
                          {formatRemaining(item.readyAt - now)}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </InnerPanel>
  );
}
