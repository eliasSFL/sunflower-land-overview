import {
  getItemIcon,
  getPetFoodRequests,
  getPetLevel,
  isCollectibleBuilt,
  type CookableName,
  type GameState,
} from "../game/index.ts";
import { useCollapsibleSection } from "../hooks/useCollapsibleSection.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { PET_CRAVINGS_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
};

type Need = {
  food: CookableName;
  need: number;
  have: number;
  short: number;
};

// Tally outstanding food requests across every placed pet (common +
// NFT) and diff against the player's inventory. Uses the same
// placement predicates as [[PetsPanel]] and the same upstream
// `getPetFoodRequests` filter so the totals here always agree with the
// per-pet rows.
function collectNeeds(state: GameState): Need[] {
  const tally = new Map<CookableName, number>();

  const accumulate = (
    requests: CookableName[],
    foodFed: CookableName[] | undefined,
  ) => {
    const fed = new Set(foodFed ?? []);
    for (const food of requests) {
      if (fed.has(food)) continue;
      tally.set(food, (tally.get(food) ?? 0) + 1);
    }
  };

  for (const pet of Object.values(state.pets?.common ?? {})) {
    if (!pet) continue;
    if (!isCollectibleBuilt({ name: pet.name, game: state })) continue;
    const { level } = getPetLevel(pet.experience);
    const requests = Array.isArray(pet.requests?.food)
      ? getPetFoodRequests(pet, level)
      : [];
    accumulate(requests, pet.requests?.foodFed);
  }

  for (const pet of Object.values(state.pets?.nfts ?? {})) {
    if (!pet) continue;
    if (!pet.coordinates) continue;
    const { level } = getPetLevel(pet.experience);
    const requests = Array.isArray(pet.requests?.food)
      ? getPetFoodRequests(pet, level)
      : [];
    accumulate(requests, pet.requests?.foodFed);
  }

  return [...tally.entries()]
    .map(([food, need]) => {
      const have = state.inventory[food]?.toNumber() ?? 0;
      return { food, need, have, short: Math.max(0, need - have) };
    })
    .sort((a, b) => {
      // Shortfalls first (largest gap), then surplus by name.
      if (a.short !== b.short) return b.short - a.short;
      return a.food.localeCompare(b.food);
    });
}

// Shopping list of pet food cravings across every placed pet,
// compared against the player's inventory. Renders nothing when no
// placed pet has an outstanding request.
export function PetCravingsPanel({ state }: Props) {
  const needs = collectNeeds(state);
  const { open, onToggle } = useCollapsibleSection(PET_CRAVINGS_SECTION_ID);
  if (needs.length === 0) return null;

  const shortCount = needs.filter((n) => n.short > 0).length;

  return (
    <InnerPanel
      id={PET_CRAVINGS_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-avoid"
    >
      <details
        open={open}
        onToggle={onToggle}
        className="group flex flex-col gap-2"
      >
        <summary className="list-none cursor-pointer marker:hidden">
          <div className="flex items-center justify-between gap-2">
            <Label
              type={shortCount > 0 ? "danger" : "default"}
              icon={getItemIcon("Pet House")}
            >
              Pet Cravings · {needs.length}
            </Label>
            <img
              src={CHROME_ICONS.chevron_down}
              alt=""
              aria-hidden
              title="Click to collapse / expand"
              className="h-auto w-6 shrink-0 transition-transform group-open:rotate-180"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </summary>
        <ul className="mt-1 flex flex-col gap-1 p-1">
          {needs.map(({ food, need, have, short }) => (
            <li
              key={food}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <img
                  src={getItemIcon(food)}
                  alt=""
                  aria-hidden
                  className="h-4 w-4 shrink-0 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="truncate">{food}</span>
              </span>
              <Label type={short > 0 ? "danger" : "success"}>
                {formatYield(have)}/{formatYield(need)}
              </Label>
            </li>
          ))}
        </ul>
      </details>
    </InnerPanel>
  );
}
