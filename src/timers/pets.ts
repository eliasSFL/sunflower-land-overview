import {
  getItemIcon,
  isCollectibleBuilt,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// A pet enters its napping window 2h after `pettedAt` (upstream:
// `PET_NAP_HOURS` / `isPetNapping` in features/game/types/pets). Petting
// itself is only allowed *during* the nap window (upstream `petPet`
// throws "Pet is not napping" otherwise), so the nap-start moment is
// also the moment the player can pet again — same shape as the animal
// love timers, so we reuse the "Petting" category.
//
// Placement gate matches the Pets / Pet Cravings panels:
// `isCollectibleBuilt` for common pets (any placeable location),
// `coordinates` for NFT pets.
//
// All pet timers share one `aggregationKey` so a player who petted
// every pet in the same session gets ONE clustered push ("N× Pet")
// rather than a notification per pet. The cluster window is 60s
// (see CLUSTER_WINDOW_MS in worker/farmPushDO.ts) — pets whose
// nap-start times drift apart fire as separate clusters.

const PET_NAP_HOURS = 2;
const NAP_MS = PET_NAP_HOURS * 60 * 60 * 1000;

// Same key for every pet — collapses the per-pet rows into a single
// aggregated card / push. Label is generic so the cluster headline
// (`${count}× ${label}`) reads as "5× Pet" rather than borrowing one
// arbitrary pet's name.
const PET_AGG_KEY = "Petting|Pet nap";
const PET_LABEL = "Pet";
const PET_ICON = getItemIcon("Pet House");

export function extractPetTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  const out: Timer[] = [];

  for (const pet of Object.values(state.pets?.common ?? {})) {
    if (!pet) continue;
    if (!isCollectibleBuilt({ name: pet.name, game: state })) continue;
    out.push({
      id: `pet-nap:common:${pet.name}`,
      category: "Petting",
      label: PET_LABEL,
      icon: PET_ICON,
      readyAt: pet.pettedAt + NAP_MS,
      aggregationKey: PET_AGG_KEY,
    });
  }

  for (const pet of Object.values(state.pets?.nfts ?? {})) {
    if (!pet) continue;
    if (!pet.coordinates) continue;
    out.push({
      id: `pet-nap:nft:${pet.id}`,
      category: "Petting",
      label: PET_LABEL,
      icon: PET_ICON,
      readyAt: pet.pettedAt + NAP_MS,
      aggregationKey: PET_AGG_KEY,
    });
  }

  return out;
}
