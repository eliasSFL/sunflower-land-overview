import { useMemo } from "react";

import {
  CHORE_DETAILS,
  NPC_CHORES,
  generateChoreRewards,
  getChoreProgress,
  getItemIcon,
  getObjectEntries,
  type GameState,
  type NpcChore,
  type NPCName,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { NPCIcon } from "./NPCIcon.tsx";
import { CHORES_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label, ProgressBar } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

type Difficulty = "Easy" | "Medium" | "Hard";

// Tier order top-to-bottom, matching the in-game board (easy first), plus
// the Label colour each tier reads as (green → orange → red).
const DIFFICULTY_ORDER: Difficulty[] = ["Easy", "Medium", "Hard"];
const DIFFICULTY_LABEL: Record<Difficulty, "success" | "warning" | "danger"> = {
  Easy: "success",
  Medium: "warning",
  Hard: "danger",
};

type ChoreRow = {
  npc: NPCName;
  chore: NpcChore;
  current: number;
  goal: number;
  pct: number;
  completed: boolean;
  ready: boolean;
  difficulty: Difficulty;
};

// Difficulty isn't an explicit field upstream — the server's weekly chore
// table is authored in reward tiers (this chapter: Salt Rock 1/2/3; coin
// weeks 250/500/750), low reward = easy. The base (unboosted) reward amount
// is that tier signal. A week uses a single currency, so coins and items
// never compete within one board; when both exist on a chore we read coins.
function rewardWeight(chore: NpcChore): number {
  const coins = chore.reward.coins ?? 0;
  if (coins > 0) return coins;
  let total = 0;
  for (const amount of Object.values(chore.reward.items)) {
    total += amount ?? 0;
  }
  return total;
}

// Rank a chore's reward weight among the distinct weights on the board into
// Easy/Medium/Hard terciles. The snapshot carries every NPC's chore
// (`makeChoreBoard` stores the full weekly table — the level-unlock gate is
// UI-only), so all three reward tiers are present and the split matches the
// in-game grouping. With fewer distinct weights the player only sees the
// tiers their board actually spans.
function assignDifficulty(weight: number, distinct: number[]): Difficulty {
  if (distinct.length <= 1) return "Easy";
  const ratio = distinct.indexOf(weight) / (distinct.length - 1);
  if (ratio <= 1 / 3) return "Easy";
  if (ratio <= 2 / 3) return "Medium";
  return "Hard";
}

// One chore per NPC (`choreBoard.chores`). Progress and goal both come
// from upstream — `getChoreProgress` (current count since the chore was
// issued) and `NPC_CHORES[name].requirement` (the goal) — so the bar
// can't drift from what the game shows on completion.
function collectChores(state: GameState): ChoreRow[] {
  const chores = state.choreBoard?.chores;
  if (!chores) return [];

  // Defensive: a save referencing a chore the pinned submodule no longer
  // defines would make `getChoreProgress` throw on the missing
  // `NPC_CHORES[name]` lookup. Drop it rather than crash the panel.
  const valid: { npc: NPCName; chore: NpcChore }[] = [];
  for (const [npc, chore] of getObjectEntries(chores)) {
    if (!chore) continue;
    if (!(chore.name in NPC_CHORES)) continue;
    valid.push({ npc, chore });
  }

  // Distinct reward weights across the whole board set the tier boundaries.
  const distinct = [
    ...new Set(valid.map(({ chore }) => rewardWeight(chore))),
  ].sort((a, b) => a - b);

  const rows: ChoreRow[] = valid.map(({ npc, chore }) => {
    const goal = NPC_CHORES[chore.name].requirement;
    const current = Math.max(0, getChoreProgress({ chore, game: state }));
    const completed = chore.completedAt !== undefined;
    return {
      npc,
      chore,
      current,
      goal,
      pct: goal > 0 ? (Math.min(current, goal) / goal) * 100 : 100,
      completed,
      ready: !completed && current >= goal,
      difficulty: assignDifficulty(rewardWeight(chore), distinct),
    };
  });

  // Pending first (closest-to-done first, most actionable), completed last.
  // Grouping by tier happens at render; this order carries within each tier.
  rows.sort((a, b) => {
    const aDone = a.completed ? 1 : 0;
    const bDone = b.completed ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return b.pct - a.pct || a.npc.localeCompare(b.npc);
  });
  return rows;
}

export function ChoresPanel({ state, now }: Props) {
  const rows = useMemo(() => collectChores(state), [state]);
  if (rows.length === 0) return null;
  const pending = rows.filter((r) => !r.completed).length;

  // Group into difficulty tiers (in-game order, empty tiers dropped). When
  // the board only spans one reward level every row lands in "Easy" — a
  // single header tells the player nothing, so we render a flat list there.
  const tiers = DIFFICULTY_ORDER.map((difficulty) => ({
    difficulty,
    rows: rows.filter((r) => r.difficulty === difficulty),
  })).filter((tier) => tier.rows.length > 0);
  const grouped = tiers.length > 1;

  return (
    <InnerPanel
      id={CHORES_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-auto! box-decoration-clone flex flex-col gap-2"
    >
      <Label type="default" icon={CHROME_ICONS.scroll}>
        Chores · {pending}
      </Label>
      {grouped ? (
        tiers.map((tier) => (
          <div
            key={tier.difficulty}
            className="flex flex-col gap-2 break-inside-avoid"
          >
            <Label type={DIFFICULTY_LABEL[tier.difficulty]}>
              {tier.difficulty} · {tier.rows.length}
            </Label>
            <ul className="flex flex-col gap-3 p-1">
              {tier.rows.map((row) => (
                <ChoreRowItem key={row.npc} row={row} state={state} now={now} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className="flex flex-col gap-3 p-1">
          {rows.map((row) => (
            <ChoreRowItem key={row.npc} row={row} state={state} now={now} />
          ))}
        </ul>
      )}
    </InnerPanel>
  );
}

function ChoreRowItem({
  row,
  state,
  now,
}: {
  row: ChoreRow;
  state: GameState;
  now: number;
}) {
  const { npc, chore, current, goal, pct, completed, ready } = row;
  // The chore → item-image map the in-game Codex tile renders. Optional
  // chaining guards a chore name the pinned submodule's CHORE_DETAILS
  // hasn't caught up to (collectChores already filters by NPC_CHORES).
  const icon = CHORE_DETAILS[chore.name]?.icon;

  return (
    <li className="flex flex-col gap-1 break-inside-avoid">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <NPCIcon npc={npc} />
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm capitalize">{npc}</span>
              {completed ? (
                <img
                  src={CHROME_ICONS.confirm}
                  alt="Completed"
                  title="Completed"
                  className="h-4 w-4 shrink-0 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : ready ? (
                <img
                  src={CHROME_ICONS.expression_alerted}
                  alt="Ready to claim"
                  title="Ready to claim"
                  className="h-4 w-4 shrink-0 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : null}
            </div>
            <span
              className="text-xs flex items-start gap-1"
              style={{ opacity: completed ? 0.6 : 0.9 }}
            >
              {icon ? (
                <img
                  src={icon}
                  alt=""
                  aria-hidden
                  className="h-4 w-4 shrink-0 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : null}
              {chore.name}
            </span>
          </div>
        </div>
        <ChoreReward chore={chore} state={state} now={now} />
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar pct={pct} className="w-full" />
        <span className="shrink-0 tabular-nums text-xs opacity-70">
          {formatYield(Math.min(current, goal))}/{formatYield(goal)}
        </span>
      </div>
    </li>
  );
}

function ChoreReward({
  chore,
  state,
  now,
}: {
  chore: NpcChore;
  state: GameState;
  now: number;
}) {
  // `generateChoreRewards` returns the reward items with the chapter
  // ticket already boosted; coins (when present) sit on the raw chore
  // and aren't boosted, so we read them straight off.
  const items = getObjectEntries(
    generateChoreRewards({ game: state, chore, now: new Date(now) }),
  );
  const coins = chore.reward.coins;

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs">
      {coins ? (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <img
            src={CHROME_ICONS.coins}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          {formatYield(coins)}
        </span>
      ) : null}
      {items.map(([name, amount]) => {
        if (!amount) return null;
        return (
          <span
            key={name}
            className="flex items-center gap-1 whitespace-nowrap"
          >
            <img
              src={getItemIcon(name)}
              alt=""
              aria-hidden
              className="h-4 w-4 shrink-0 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            {formatYield(amount)}
          </span>
        );
      })}
    </div>
  );
}
