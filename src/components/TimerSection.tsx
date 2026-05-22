import type { AggregatedTimer, Category } from "../timers/index.ts";
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

export function TimerSection({ category, timers, now }: Props) {
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
          {sorted.map((t) => (
            <TimerCard key={t.id} timer={t} now={now} />
          ))}
        </div>
      )}
    </InnerPanel>
  );
}
