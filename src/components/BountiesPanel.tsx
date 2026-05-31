import { useMemo } from "react";

import {
  BOUNTY_CATEGORIES,
  canSellBounty,
  getCountAndType,
  getItemIcon,
  type BountyRequest,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { BountyReward } from "./BountyReward.tsx";
import { NPCIcon } from "./NPCIcon.tsx";
import { BOUNTIES_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

// A bounty belongs on Poppy's board iff it matches one of the upstream
// category guards. Animal bounties match none — they're exchanged at the
// barn, not Poppy's board, and don't have a clean inventory have/need — so
// reusing the guards keeps us aligned with the in-game board without
// re-implementing the filter.
const isOnBoard = (b: BountyRequest): boolean =>
  Object.values(BOUNTY_CATEGORIES).some((matches) => matches(b));

type BountyRow = {
  bounty: BountyRequest;
  completed: boolean;
};

function collectBounties(state: GameState): BountyRow[] {
  const requests = state.bounties?.requests ?? [];
  const completedIds = new Set(
    (state.bounties?.completed ?? []).map((c) => c.id),
  );

  const rows = requests.filter(isOnBoard).map((bounty) => ({
    bounty,
    completed: completedIds.has(bounty.id),
  }));

  // Pending first, completed last (matches the Deliveries ordering).
  rows.sort((a, b) => Number(a.completed) - Number(b.completed));
  return rows;
}

export function BountiesPanel({ state, now }: Props) {
  const rows = useMemo(() => collectBounties(state), [state]);
  if (rows.length === 0) return null;
  const pending = rows.filter((r) => !r.completed).length;

  return (
    <InnerPanel
      id={BOUNTIES_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-auto! box-decoration-clone flex flex-col gap-2"
    >
      <div className="flex items-center gap-1">
        <NPCIcon npc="poppy" size={24} />
        <Label type="default" icon={CHROME_ICONS.chest}>
          Bounties · {pending}
        </Label>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <BountyRowItem
            key={row.bounty.id}
            row={row}
            state={state}
            now={now}
          />
        ))}
      </ul>
    </InnerPanel>
  );
}

function BountyRowItem({
  row,
  state,
  now,
}: {
  row: BountyRow;
  state: GameState;
  now: number;
}) {
  const { bounty, completed } = row;
  const name = bounty.name;
  // Mark bounties want a stack; everything else wants a single item.
  const required = BOUNTY_CATEGORIES["Mark Bounties"](bounty)
    ? bounty.quantity
    : 1;
  const have = getCountAndType(state, name).count.toNumber();
  // `canSellBounty` is the upstream eligibility check (also false once
  // completed, but completed rows render their own badge instead).
  const ready = !completed && canSellBounty(state, bounty.id);

  return (
    <li className="flex items-start justify-between gap-3 break-inside-avoid">
      <div className="flex items-start gap-2 min-w-0">
        <img
          src={getItemIcon(name)}
          alt=""
          aria-hidden
          className="h-8 w-8 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex flex-col min-w-0 gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm capitalize">{name}</span>
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
                alt="Ready to exchange"
                title="Ready to exchange"
                className="h-4 w-4 shrink-0 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
          </div>
          <span
            className="flex items-center gap-1 text-xs min-w-0"
            style={{
              color: completed || have >= required ? undefined : "#e43b44",
              opacity: completed ? 0.6 : 0.9,
            }}
          >
            {completed
              ? `${formatYield(required)} ${name}`
              : `${formatYield(have)}/${formatYield(required)} ${name}`}
          </span>
        </div>
      </div>
      <BountyReward bounty={bounty} state={state} now={now} />
    </li>
  );
}
