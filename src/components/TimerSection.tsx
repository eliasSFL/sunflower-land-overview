import { useState } from "react";

import type { AggregatedTimer, Category } from "../timers/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { getCategoryIcon } from "./categoryIcon.ts";
import { EmptyVignette } from "./EmptyVignette.tsx";
import { sectionId } from "./sectionId.ts";
import { TimerCard } from "./TimerCard.tsx";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  category: Category;
  timers: AggregatedTimer[];
  now: number;
};

// A stack of this many fully-ready cards collapses into a single
// "N ready" roll-up. Below it they read fine inline; at/above it the
// repeated green "Ready" chips stop carrying signal and just push the
// still-cooking rows off-screen — so we fold them behind one chip the
// player can expand on demand.
const ROLLUP_THRESHOLD = 3;

// A timer is "fully ready" — eligible to roll up — when it's actively
// producing and has nothing left pending. For multi-slot cooking cards
// that means every slot is ready; collapsing a card with a pending slot
// would hide a countdown the player still cares about.
function isFullyReady(t: AggregatedTimer, now: number): boolean {
  if (t.idle) return false;
  if (t.slots && t.slots.length > 0)
    return t.slots.every((s) => s.readyAt <= now);
  return t.readyAt <= now;
}

export function TimerSection({ category, timers, now }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Idle entries (placed-but-not-producing sources like an empty
  // Kitchen) sort to the bottom regardless of `readyAt`.
  const sorted = [...timers].sort((a, b) => {
    const idleDiff = Number(!!a.idle) - Number(!!b.idle);
    if (idleDiff !== 0) return idleDiff;
    return a.readyAt - b.readyAt;
  });
  const totalCount = sorted.reduce((acc, t) => acc + t.count, 0);
  // "Nothing active" = no timers at all, OR every timer is a passive
  // idle placeholder. The latter covers cooking buildings / aging-shed
  // racks, whose extractors emit a placeholder idle row per placed
  // instance (so the panel stays gated visible). Without this branch a
  // placed-but-empty Fish Market would render its idle row instead of
  // the more inviting vignette.
  //
  // Timers whose idle state is actionable — i.e. the player needs to
  // do something about it — carry an `idleLabelType` so the card
  // renders a colored chip ("Paused" for a beehive whose flowers all
  // matured or whose flower beds are empty). Those rows MUST render;
  // collapsing them into the vignette would hide the action.
  const hasActionableIdle = sorted.some(
    (t) => t.idle === true && t.idleLabelType !== undefined,
  );
  const isEmpty =
    !hasActionableIdle &&
    (sorted.length === 0 || sorted.every((t) => t.idle === true));

  // Split the (already sorted) list so a run of fully-ready cards can
  // fold into one chip while everything still cooking renders inline.
  // `ready` keeps source order, so it sits first (readyAt ascending).
  const ready = sorted.filter((t) => isFullyReady(t, now));
  const rest = sorted.filter((t) => !isFullyReady(t, now));
  const rollUp = ready.length >= ROLLUP_THRESHOLD && !expanded;

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
        <EmptyVignette category={category} />
      ) : (
        <div className="flex flex-col gap-2">
          {rollUp ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Show ready items"
              className="flex cursor-pointer items-center gap-2 rounded-sm p-1 hover:bg-[#3e8948]/10"
            >
              <Label type="success">{ready.length} ready</Label>
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {ready
                  .slice(0, 8)
                  .map((t) =>
                    t.icon ? (
                      <img
                        key={t.id}
                        src={t.icon}
                        alt=""
                        aria-hidden
                        className="h-6 w-6 shrink-0 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : null,
                  )}
              </span>
              <img
                src={CHROME_ICONS.chevron_down}
                alt=""
                aria-hidden
                className="ml-auto h-auto w-5 shrink-0"
                style={{ imageRendering: "pixelated" }}
              />
            </button>
          ) : (
            ready.map((t) => <TimerCard key={t.id} timer={t} now={now} />)
          )}
          {ready.length >= ROLLUP_THRESHOLD && expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex cursor-pointer items-center justify-center gap-1 self-center text-xs opacity-70 hover:opacity-100"
            >
              <span>Collapse {ready.length} ready</span>
              <img
                src={CHROME_ICONS.chevron_down}
                alt=""
                aria-hidden
                className="h-auto w-5 shrink-0 rotate-180"
                style={{ imageRendering: "pixelated" }}
              />
            </button>
          ) : null}
          {rest.map((t) => (
            <TimerCard key={t.id} timer={t} now={now} />
          ))}
        </div>
      )}
    </InnerPanel>
  );
}
