import { upcomingWithin, type AggregatedTimer } from "../timers/index.ts";
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
      {/* The track sits in a padded box: top room for hover popovers,
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
          {items.map((item) => {
            const msUntil = item.readyAt - now;
            const left = (msUntil / WINDOW_MS) * 100;
            return (
              <div
                key={item.key}
                className="group absolute top-1/2 z-[2] h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-[#3e2731] hover:z-[5]"
                style={{ left: `${left}%`, background: dotColour(msUntil) }}
                title={`${
                  item.amount > 0 ? `${formatYield(item.amount)} ` : ""
                }${item.label} — ${formatRemaining(msUntil)}`}
              >
                <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap rounded-sm border-2 border-[#3e2731] bg-[#fff3e0] px-1.5 py-1 group-hover:flex">
                  {item.icon ? (
                    <img
                      src={item.icon}
                      alt=""
                      aria-hidden
                      className="h-5 w-5 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null}
                  <span className="text-xxs">
                    {item.amount > 0
                      ? `${formatYield(item.amount)} ${item.label}`
                      : item.label}
                  </span>
                  <span className="text-xxs opacity-60">
                    {formatRemaining(msUntil)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </InnerPanel>
  );
}
