import { InnerPanel, Label } from "./ui/index.ts";
import {
  getRemainingDigs,
  getTreasuresFound,
  getArtefactsFound,
  hasClaimedReward,
  secondsTillDesertStorm,
  CHAPTER_ARTEFACT,
  getCurrentChapter,
  getItemIcon,
  type GameState,
} from "../game/index.ts";
import { formatRemaining } from "../lib/format.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { DIG_ICONS } from "../digging/assets.ts";

// The dig-site stat strip: boosted digs-left, daily reset countdown,
// treasures + chapter artefacts found, and the daily streak. Every number
// is a live game fact pulled from upstream helpers — the page layers its
// own deduction on top, but never invents these counts.
export function DiggingStatsPanel({
  state,
  now,
}: {
  state: GameState;
  now: number;
}) {
  const digsLeft = getRemainingDigs(state);
  const treasures = getTreasuresFound({ game: state }).length;
  const artefacts = getArtefactsFound({ game: state, now });
  const streak = state.desert.digging.streak?.count ?? 0;
  const claimed = hasClaimedReward({ game: state });
  const artefactIcon = getItemIcon(CHAPTER_ARTEFACT[getCurrentChapter(now)]);
  const reset = formatRemaining(secondsTillDesertStorm() * 1000);

  return (
    <InnerPanel>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 p-1">
        <Label
          type={digsLeft > 0 ? "warning" : "danger"}
          icon={DIG_ICONS.shovel}
        >
          {digsLeft} digs left
        </Label>
        <Label type="info" icon={DIG_ICONS.stopwatch}>
          {reset} left
        </Label>
        <Label type="success" icon={DIG_ICONS.treasure}>
          {treasures} treasures
        </Label>
        <Label type="default" icon={artefactIcon}>
          {artefacts}/3 artefacts
        </Label>
        <Label
          type={claimed ? "success" : "default"}
          icon={CHROME_ICONS.confirm}
        >
          Streak {streak}
        </Label>
      </div>
    </InnerPanel>
  );
}
