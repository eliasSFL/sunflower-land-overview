import type { ReactNode } from "react";

import { AnimalBountiesPanel } from "../components/AnimalBountiesPanel.tsx";
import { BountiesPanel } from "../components/BountiesPanel.tsx";
import { BumpkinSummaryPanel } from "../components/BumpkinSummaryPanel.tsx";
import { getCategoryIcon } from "../components/categoryIcon.ts";
import { ChoresPanel } from "../components/ChoresPanel.tsx";
import { DeliveriesPanel } from "../components/DeliveriesPanel.tsx";
import { IdlePanel } from "../components/IdlePanel.tsx";
import { InstallPromptPanel } from "../components/InstallPromptPanel.tsx";
import { LoveIslandShopPanel } from "../components/LoveIslandShopPanel.tsx";
import { PetCravingsPanel } from "../components/PetCravingsPanel.tsx";
import { PetsPanel } from "../components/PetsPanel.tsx";
import {
  ANIMAL_BOUNTIES_SECTION_ID,
  BOUNTIES_SECTION_ID,
  BUMPKIN_SECTION_ID,
  CHORES_SECTION_ID,
  IDLE_SECTION_ID,
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

export const TIMERS_PAGE_KEY = "timers";
export const INFO_PAGE_KEY = "info";

export const INSTALL_PANEL_ID = "panel-install";
export const DELIVERIES_PANEL_ID = "panel-deliveries";

type TimersCtx = {
  data: FarmResponse;
  byCategory: Map<string, AggregatedTimer[]>;
  visibleCategories: Category[];
  now: number;
};

type InfoCtx = {
  data: FarmResponse;
  now: number;
};

// Default source order for /timers: pinned Install → Idle → one section
// per visible category (already gated upstream in App). The Ready / Next
// up banners are NOT here — they live full-width above the column flow
// and aren't part of the arrangeable grid.
export function buildTimersPanels(ctx: TimersCtx): PanelDescriptor[] {
  const panels: PanelDescriptor[] = [
    {
      id: INSTALL_PANEL_ID,
      label: "Install app",
      icon: CHROME_ICONS.scroll,
      pinned: true,
      render: () => <InstallPromptPanel farmId={ctx.data.id} />,
    },
    {
      id: IDLE_SECTION_ID,
      label: "Idle",
      icon: CHROME_ICONS.sleep,
      render: () => (
        <IdlePanel
          state={ctx.data.farm}
          byCategory={ctx.byCategory}
          now={ctx.now}
        />
      ),
    },
  ];
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

// Default source order for /info. Mirrors FarmInfoPage's historical JSX
// order so a player who never opens the Arrange sheet sees no change.
export function buildInfoPanels(ctx: InfoCtx): PanelDescriptor[] {
  return [
    {
      id: INSTALL_PANEL_ID,
      label: "Install app",
      icon: CHROME_ICONS.scroll,
      pinned: true,
      render: () => <InstallPromptPanel farmId={ctx.data.id} />,
    },
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
