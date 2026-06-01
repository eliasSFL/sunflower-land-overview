import type { ReactNode } from "react";

import { AnimalBountiesPanel } from "../components/AnimalBountiesPanel.tsx";
import { BountiesPanel } from "../components/BountiesPanel.tsx";
import { BumpkinSummaryPanel } from "../components/BumpkinSummaryPanel.tsx";
import { getCategoryIcon } from "../components/categoryIcon.ts";
import { ChoresPanel } from "../components/ChoresPanel.tsx";
import { DeliveriesPanel } from "../components/DeliveriesPanel.tsx";
import { InstallPromptPanel } from "../components/InstallPromptPanel.tsx";
import { LoveIslandShopPanel } from "../components/LoveIslandShopPanel.tsx";
import { PetCravingsPanel } from "../components/PetCravingsPanel.tsx";
import { PetsPanel } from "../components/PetsPanel.tsx";
import {
  ANIMAL_BOUNTIES_SECTION_ID,
  BOUNTIES_SECTION_ID,
  BUMPKIN_SECTION_ID,
  CHORES_SECTION_ID,
  LOVE_ISLAND_SHOP_SECTION_ID,
  PET_CRAVINGS_SECTION_ID,
  PETS_SECTION_ID,
  sectionId,
  VILLAGE_PROJECTS_SECTION_ID,
} from "../components/sectionId.ts";
import { TimerSection } from "../components/TimerSection.tsx";
import { VillageProjectsPanel } from "../components/VillageProjectsPanel.tsx";
import type { FarmResponse } from "../api/fetchFarm.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { getItemIcon } from "../game/index.ts";
import type { AggregatedTimer, Category } from "../timers/index.ts";

// A single reorderable unit on a page. The unit is a top-level source
// child of the masonry flow — note `panel-deliveries` renders THREE
// sibling cards (Coins / FLOWER / Tickets) but moves as one group, since
// DeliveriesPanel emits them from a single component.
//
// `pinned` panels (the PWA install nudge) aren't arrangeable or hideable:
// they always render first, in builder order, and never appear in the
// Arrange sheet. Everything else is reorder/hide candidate.
//
// `id` doubles as the persisted arrangement key and the dnd-kit sortable
// id, so it must be stable across releases. Where a panel stamps a single
// DOM section id we reuse it (so the mobile jump-nav and the arrangement
// share one id space); the multi-card Deliveries group gets its own
// synthetic `panel-` id.
export type PanelDescriptor = {
  id: string;
  label: string;
  icon: string;
  pinned?: boolean;
  render: () => ReactNode;
};

// Persisted-arrangement keys, one per arrangeable page. Bespoke pages
// (Now, Digging) have no arrangeable flow and so no key.
export const PRODUCING_PAGE_KEY = "producing";
export const QUESTS_PAGE_KEY = "quests";
export const FARM_PAGE_KEY = "farm";

export const INSTALL_PANEL_ID = "panel-install";
export const DELIVERIES_PANEL_ID = "panel-deliveries";

type ProducingCtx = {
  data: FarmResponse;
  byCategory: Map<string, AggregatedTimer[]>;
  visibleCategories: Category[];
  now: number;
};

type QuestsCtx = {
  data: FarmResponse;
  now: number;
};

type FarmCtx = {
  data: FarmResponse;
  now: number;
};

// The pinned PWA install nudge — first panel on every arrangeable page,
// so it stays out of the reorder/hide set. Self-hides once dismissed or
// installed (its `view.kind === "hidden"`), so the instances stay in
// sync across pages.
function installPanel(data: FarmResponse): PanelDescriptor {
  return {
    id: INSTALL_PANEL_ID,
    label: "Install app",
    icon: CHROME_ICONS.scroll,
    pinned: true,
    render: () => <InstallPromptPanel farmId={data.id} />,
  };
}

// Default source order for /producing: pinned Install → one section per
// visible category (already gated upstream in App). Ready-now aggregation
// + the next-4h timeline live on the Now page, not here, so this page is
// purely "what's mid-timer".
export function buildProducingPanels(ctx: ProducingCtx): PanelDescriptor[] {
  const panels: PanelDescriptor[] = [installPanel(ctx.data)];
  for (const cat of ctx.visibleCategories) {
    panels.push({
      id: sectionId(cat),
      label: cat,
      icon: getCategoryIcon(cat),
      render: () => (
        <TimerSection
          category={cat}
          timers={ctx.byCategory.get(cat) ?? []}
          now={ctx.now}
        />
      ),
    });
  }
  return panels;
}

// Default source order for /quests: everything you owe an NPC —
// Deliveries (3 currency cards as one group), Chores, Bounties, Animal
// Bounties.
export function buildQuestsPanels(ctx: QuestsCtx): PanelDescriptor[] {
  return [
    installPanel(ctx.data),
    {
      id: DELIVERIES_PANEL_ID,
      label: "Deliveries",
      icon: CHROME_ICONS.coins,
      render: () => <DeliveriesPanel state={ctx.data.farm} now={ctx.now} />,
    },
    {
      id: CHORES_SECTION_ID,
      label: "Chores",
      icon: CHROME_ICONS.scroll,
      render: () => <ChoresPanel state={ctx.data.farm} now={ctx.now} />,
    },
    {
      id: BOUNTIES_SECTION_ID,
      label: "Bounties",
      icon: CHROME_ICONS.chest,
      render: () => <BountiesPanel state={ctx.data.farm} now={ctx.now} />,
    },
    {
      id: ANIMAL_BOUNTIES_SECTION_ID,
      label: "Animal Bounties",
      icon: getItemIcon("Cow"),
      render: () => <AnimalBountiesPanel state={ctx.data.farm} now={ctx.now} />,
    },
  ];
}

// Default source order for /farm: your identity and standing —
// Bumpkin, Village Projects, Love Island Shop, Pet Cravings, Pets.
export function buildFarmPanels(ctx: FarmCtx): PanelDescriptor[] {
  return [
    installPanel(ctx.data),
    {
      id: BUMPKIN_SECTION_ID,
      label: "Bumpkin",
      icon: CHROME_ICONS.player,
      render: () => <BumpkinSummaryPanel data={ctx.data} />,
    },
    {
      id: VILLAGE_PROJECTS_SECTION_ID,
      label: "Village Projects",
      icon: CHROME_ICONS.cheer,
      render: () => <VillageProjectsPanel state={ctx.data.farm} />,
    },
    {
      id: LOVE_ISLAND_SHOP_SECTION_ID,
      label: "Love Island Shop",
      icon: CHROME_ICONS.love_charm,
      render: () => <LoveIslandShopPanel state={ctx.data.farm} />,
    },
    {
      id: PET_CRAVINGS_SECTION_ID,
      label: "Pet Cravings",
      icon: getItemIcon("Pet House"),
      render: () => <PetCravingsPanel state={ctx.data.farm} />,
    },
    {
      id: PETS_SECTION_ID,
      label: "Pets",
      icon: getItemIcon("Pet House"),
      render: () => <PetsPanel state={ctx.data.farm} />,
    },
  ];
}
