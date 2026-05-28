import {
  REQUIRED_CHEERS,
  REWARD_ITEMS,
  getItemIcon,
  getObjectEntries,
  getProjectReward,
  type GameState,
  type MonumentName,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { InnerPanel, Label, ProgressBar } from "./ui/index.ts";

type Props = {
  state: GameState;
};

type ActiveRow = {
  name: MonumentName;
  cheers: number;
  required: number;
  pct: number;
};

// `REWARD_ITEMS` only covers the 6 workbench-fruit + cooking-pot
// monuments. Narrows MonumentName to the rewarded subset so the
// reward chip can render a typed lookup.
type RewardedProject = keyof typeof REWARD_ITEMS;
const isRewarded = (name: MonumentName): name is RewardedProject =>
  name in REWARD_ITEMS;

function collectActive(state: GameState): ActiveRow[] {
  const villageProjects = state.socialFarming?.villageProjects;
  if (!villageProjects) return [];

  const rows: ActiveRow[] = [];
  for (const [name, project] of getObjectEntries(villageProjects)) {
    if (!project) continue;
    const required = REQUIRED_CHEERS[name];
    const cheers = Math.min(project.cheers, required);
    rows.push({
      name,
      cheers,
      required,
      pct: required > 0 ? (cheers / required) * 100 : 100,
    });
  }
  // Closest to completion first — most actionable to surface.
  rows.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  return rows;
}

export function VillageProjectsPanel({ state }: Props) {
  const active = collectActive(state);
  const completed = state.socialFarming?.completedProjects ?? [];
  if (active.length === 0 && completed.length === 0) return null;

  return (
    <InnerPanel className="mb-2 w-full scroll-mt-4 break-inside-avoid flex flex-col gap-2">
      <Label type="default" icon={CHROME_ICONS.cheer}>
        Village Projects · {active.length}
      </Label>

      {active.length > 0 ? (
        <ul className="flex flex-col gap-2 p-1">
          {active.map((row) => (
            <ProjectRow key={row.name} row={row} state={state} />
          ))}
        </ul>
      ) : null}

      {completed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 p-1">
          <span className="text-xs opacity-70">Completed:</span>
          {completed.map((name) => (
            <Label key={name} type="success" icon={getItemIcon(name)}>
              {name}
            </Label>
          ))}
        </div>
      ) : null}
    </InnerPanel>
  );
}

function ProjectRow({ row, state }: { row: ActiveRow; state: GameState }) {
  const { name, cheers, required, pct } = row;
  const reward = isRewarded(name)
    ? // `getProjectReward` applies Cornucopia's +1 to Big Fruits — the
      // panel previews the boosted amount the player will actually get.
      getProjectReward({
        project: name,
        game: state,
        amount: REWARD_ITEMS[name].amount,
      })
    : null;

  return (
    <li className="flex flex-col gap-1 text-xs">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <img
            src={getItemIcon(name)}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          <span className="truncate">{name}</span>
        </span>
        <span className="shrink-0 tabular-nums opacity-70">
          {formatYield(cheers)}/{formatYield(required)}
        </span>
      </div>
      <ProgressBar pct={pct} className="w-full" />
      {reward && isRewarded(name) ? (
        <div className="flex items-center justify-end gap-1">
          <Label type="default" icon={getItemIcon(REWARD_ITEMS[name].item)}>
            {reward.amount}× {REWARD_ITEMS[name].item}
          </Label>
          {reward.boostsUsed.length > 0 ? (
            <img
              src={CHROME_ICONS.lightning}
              alt=""
              aria-hidden
              title={`Boosted by ${reward.boostsUsed.join(", ")}`}
              className="h-3.5 w-3.5 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
