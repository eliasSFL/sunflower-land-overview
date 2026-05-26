import {
  getItemIcon,
  getPetFoodRequests,
  getPetImage,
  getPetLevel,
  getPetRequestXP,
  getPetType,
  isCollectibleBuilt,
  isPetNapping,
  isPetNeglected,
  type GameState,
  type Pet,
  type PetName,
  type PetNFT,
} from "../game/index.ts";
import { useNow } from "../hooks/useNow.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { PETS_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";
import type { LabelType } from "./ui/index.ts";

type Props = {
  state: GameState;
};

// One pet ready to render. `imageId` is what getPetImage keys on: the
// breed name for common pets, the numeric token id for NFT pets.
type PetView = {
  key: string;
  imageId: PetName | number;
  displayName: string;
  pet: Pet | PetNFT;
};

// Mirrors upstream's `isPetPlaced` gate in `feedPet`: a common pet is
// placed when `isCollectibleBuilt` returns true (any ready PlacedItem
// in any placeable location, including petHouse), and an NFT pet is
// placed when its `coordinates` are set (any location).
function collectPets(state: GameState): PetView[] {
  const out: PetView[] = [];
  for (const pet of Object.values(state.pets?.common ?? {})) {
    if (!pet) continue;
    if (!isCollectibleBuilt({ name: pet.name, game: state })) continue;
    out.push({
      key: `common:${pet.name}`,
      imageId: pet.name,
      displayName: pet.name,
      pet,
    });
  }
  for (const pet of Object.values(state.pets?.nfts ?? {})) {
    if (!pet) continue;
    if (!pet.coordinates) continue;
    out.push({
      key: `nft:${pet.id}`,
      imageId: pet.id,
      displayName: pet.name,
      pet,
    });
  }
  return out;
}

// Static "who's in the pet house" overview. Reads each pet's live state
// straight off `state.pets` and shows level / XP, energy, current state
// (napping / neglected / fed), and today's food cravings flagged by
// whether they've already been fed. No countdowns — napping and neglect
// are surfaced as state labels, not timers.
//
// Every derived value comes from an upstream helper: `getPetLevel`,
// `getPetType`, `isPetNapping`, `isPetNeglected`, `getPetFoodRequests`
// (the level-tier filter from the feed reducer), `getPetRequestXP`, and
// `getPetImage` (which yields a CDN URL for NFT pets so we never
// composite trait sprites ourselves).
export function PetsPanel({ state }: Props) {
  const now = useNow(60_000);
  const pets = collectPets(state);

  if (pets.length === 0) return null;

  return (
    <InnerPanel
      id={PETS_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-avoid"
    >
      <details open className="group flex flex-col gap-2">
        <summary className="list-none cursor-pointer marker:hidden">
          <div className="flex items-center justify-between gap-2">
            <Label type="default" icon={getItemIcon("Pet House")}>
              Pets · {pets.length}
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
        <ul className="mt-2 flex flex-col gap-2">
          {pets.map((view) => (
            <PetRow key={view.key} view={view} now={now} />
          ))}
        </ul>
      </details>
    </InnerPanel>
  );
}

function PetRow({ view, now }: { view: PetView; now: number }) {
  const { pet, imageId, displayName } = view;

  const type = getPetType(pet);
  const { level, currentProgress, experienceBetweenLevels, percentage } =
    getPetLevel(pet.experience);
  const napping = isPetNapping(pet, now);
  const neglected = isPetNeglected(pet, now);
  const image = getPetImage(napping ? "asleep" : "happy", imageId);

  // A sanitised payload could in theory drop the requests array; guard
  // before handing it to the upstream filter (which spreads it).
  const requests = Array.isArray(pet.requests?.food)
    ? getPetFoodRequests(pet, level)
    : [];
  const foodFed = pet.requests?.foodFed ?? [];
  const allFed =
    requests.length > 0 && requests.every((f) => foodFed.includes(f));

  let stateLabel: { text: string; type: LabelType } | null = null;
  if (neglected) stateLabel = { text: "Neglected", type: "danger" };
  else if (napping) stateLabel = { text: "Napping", type: "info" };
  else if (allFed) stateLabel = { text: "Fed", type: "success" };

  const pct = Math.min(100, Math.max(0, percentage));

  return (
    <li className="flex flex-col gap-1 border-t border-black/10 pt-2 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <img
            src={image}
            alt=""
            aria-hidden
            className="h-8 w-8 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{displayName}</span>
            {type ? (
              <span className="truncate text-xs opacity-60">{type}</span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {stateLabel ? (
            <Label type={stateLabel.type}>{stateLabel.text}</Label>
          ) : null}
          <span className="text-xs whitespace-nowrap tabular-nums">
            Lv {level}
          </span>
        </span>
      </div>

      {/* XP progress — mirrors the in-game HUD bar (see BumpkinSummaryPanel):
          pixel-art bordered track with the same fill/background colours. */}
      <div className="flex items-center gap-2">
        <div
          className="relative h-4.5 flex-1"
          style={{
            borderStyle: "solid",
            borderImage: `url(${CHROME_ICONS.progress_bar_border}) 20% 20% 30%`,
            borderLeftWidth: "5.25px",
            borderRightWidth: "5.25px",
            borderTopWidth: "5.25px",
            borderBottomWidth: "7.875px",
            backgroundColor: "#193c3e",
            imageRendering: "pixelated",
          }}
        >
          <div
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: "#63c74d" }}
            aria-hidden
          />
        </div>
        <span className="shrink-0 opacity-70 tabular-nums text-xs">
          {formatInt(currentProgress)}/{formatInt(experienceBetweenLevels)} XP
        </span>
      </div>

      <span className="flex items-center gap-1 text-xs">
        <img
          src={CHROME_ICONS.lightning}
          alt=""
          aria-hidden
          className="h-3.5 w-3.5 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="opacity-70">Energy</span>
        <span className="tabular-nums">{formatYield(pet.energy)}</span>
      </span>

      {requests.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {requests.map((food) => {
            const fed = foodFed.includes(food);
            return (
              <li
                key={food}
                className="flex items-center justify-between gap-2"
                style={{ opacity: fed ? 0.5 : 1 }}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs">
                  <img
                    src={getItemIcon(food)}
                    alt=""
                    aria-hidden
                    className="h-4 w-4 shrink-0 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="truncate">{food}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap tabular-nums opacity-70">
                  +{getPetRequestXP(food)} XP
                  {fed ? (
                    <img
                      src={CHROME_ICONS.confirm}
                      alt="Fed"
                      title="Fed today"
                      className="h-3.5 w-3.5 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function formatInt(value: number): string {
  return Math.round(value).toLocaleString();
}
