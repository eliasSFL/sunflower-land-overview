import { useMemo } from "react";

import {
  ANIMALS,
  getItemIcon,
  isValidDeal,
  type AnimalBounty,
  type BountyRequest,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { BountyReward } from "./BountyReward.tsx";
import { NPCIcon } from "./NPCIcon.tsx";
import { ANIMAL_BOUNTIES_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

// An animal bounty is one whose wanted item is an animal type — the same
// `name in ANIMALS` discriminator `generateBountyCoins` uses. These never
// match the item-only `BOUNTY_CATEGORIES`, so they're exactly the bounties
// the Poppy board (BountiesPanel) leaves out.
const isAnimalBounty = (b: BountyRequest): b is AnimalBounty =>
  b.name in ANIMALS;

type AnimalRow = {
  bounty: AnimalBounty;
  eligible: number;
  completed: boolean;
};

// Every placed animal lives in one of the two animal buildings; `isValidDeal`
// matches the wanted type itself, so we don't pre-split by hen house / barn.
function placedAnimals(state: GameState) {
  return [
    ...Object.values(state.henHouse?.animals ?? {}),
    ...Object.values(state.barn?.animals ?? {}),
  ];
}

function collectAnimalBounties(state: GameState): AnimalRow[] {
  const requests = state.bounties?.requests ?? [];
  const completedIds = new Set(
    (state.bounties?.completed ?? []).map((c) => c.id),
  );
  const animals = placedAnimals(state);

  const rows = requests.filter(isAnimalBounty).map((bounty) => ({
    bounty,
    // Count animals that could satisfy this bounty right now — upstream's
    // eligibility check (type, level, awake) is the single source of truth.
    eligible: animals.filter((animal) => isValidDeal({ animal, deal: bounty }))
      .length,
    completed: completedIds.has(bounty.id),
  }));

  // Pending first; within each, by animal type then ascending level (the
  // order grabnab's in-game board uses). Completed sink to the bottom.
  rows.sort((a, b) => {
    const done = Number(a.completed) - Number(b.completed);
    if (done) return done;
    return (
      a.bounty.name.localeCompare(b.bounty.name) ||
      a.bounty.level - b.bounty.level
    );
  });
  return rows;
}

export function AnimalBountiesPanel({ state, now }: Props) {
  const rows = useMemo(() => collectAnimalBounties(state), [state]);
  if (rows.length === 0) return null;
  const pending = rows.filter((r) => !r.completed).length;

  return (
    <InnerPanel
      id={ANIMAL_BOUNTIES_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-auto! box-decoration-clone flex flex-col gap-2"
    >
      <div className="flex items-center gap-1">
        <NPCIcon npc="grabnab" size={24} />
        <Label type="default" icon={getItemIcon("Cow")}>
          Animal Bounties · {pending}
        </Label>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <AnimalRowItem
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

function AnimalRowItem({
  row,
  state,
  now,
}: {
  row: AnimalRow;
  state: GameState;
  now: number;
}) {
  const { bounty, eligible, completed } = row;
  const name = bounty.name;
  const ready = !completed && eligible > 0;

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
            <span className="text-xs opacity-70 tabular-nums">
              Lvl {bounty.level}+
            </span>
            {completed ? (
              <img
                src={CHROME_ICONS.confirm}
                alt="Exchanged"
                title="Exchanged"
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
            className="text-xs"
            style={{
              color: completed || eligible > 0 ? undefined : "#e43b44",
              opacity: completed ? 0.6 : 0.9,
            }}
          >
            {completed
              ? "Exchanged"
              : eligible > 0
                ? `${eligible} ready to exchange`
                : `None at Lvl ${bounty.level}+`}
          </span>
        </div>
      </div>
      <BountyReward bounty={bounty} state={state} now={now} />
    </li>
  );
}
