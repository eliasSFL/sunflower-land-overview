import { useMemo } from "react";

import {
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

type ChoreRow = {
  npc: NPCName;
  chore: NpcChore;
  current: number;
  goal: number;
  pct: number;
  completed: boolean;
  ready: boolean;
};

// One chore per NPC (`choreBoard.chores`). Progress and goal both come
// from upstream — `getChoreProgress` (current count since the chore was
// issued) and `NPC_CHORES[name].requirement` (the goal) — so the bar
// can't drift from what the game shows on completion.
function collectChores(state: GameState): ChoreRow[] {
  const chores = state.choreBoard?.chores;
  if (!chores) return [];

  const rows: ChoreRow[] = [];
  for (const [npc, chore] of getObjectEntries(chores)) {
    if (!chore) continue;
    // Defensive: a save referencing a chore the pinned submodule no
    // longer defines would make `getChoreProgress` throw on the missing
    // `NPC_CHORES[name]` lookup. Drop it rather than crash the panel.
    if (!(chore.name in NPC_CHORES)) continue;

    const goal = NPC_CHORES[chore.name].requirement;
    const current = Math.max(0, getChoreProgress({ chore, game: state }));
    const completed = chore.completedAt !== undefined;
    rows.push({
      npc,
      chore,
      current,
      goal,
      pct: goal > 0 ? (Math.min(current, goal) / goal) * 100 : 100,
      completed,
      ready: !completed && current >= goal,
    });
  }

  // Pending first (closest-to-done first, most actionable), completed last.
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

  return (
    <InnerPanel
      id={CHORES_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-auto! box-decoration-clone flex flex-col gap-2"
    >
      <Label type="default" icon={CHROME_ICONS.scroll}>
        Chores · {pending}
      </Label>
      <ul className="flex flex-col gap-3 p-1">
        {rows.map((row) => (
          <ChoreRowItem key={row.npc} row={row} state={state} now={now} />
        ))}
      </ul>
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
              className="text-xs"
              style={{ opacity: completed ? 0.6 : 0.9 }}
            >
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
