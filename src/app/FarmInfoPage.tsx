import type { FarmResponse } from "../api/fetchFarm.ts";
import { BumpkinSummaryPanel } from "../components/BumpkinSummaryPanel.tsx";
import { DeliveriesPanel } from "../components/DeliveriesPanel.tsx";
import { InstallPromptPanel } from "../components/InstallPromptPanel.tsx";
import { LoveIslandShopPanel } from "../components/LoveIslandShopPanel.tsx";
import { PetCravingsPanel } from "../components/PetCravingsPanel.tsx";
import { PetsPanel } from "../components/PetsPanel.tsx";
import { VillageProjectsPanel } from "../components/VillageProjectsPanel.tsx";

// Page body of the /info route. Same multi-column flow as the
// LiveTimers page so the visual rhythm carries between tabs, but
// populated with identity / activity / event panels instead of
// timers. Source order is Bumpkin → Install → Deliveries → Love
// Island Shop → Village Projects → Pet Cravings → Pets; the browser
// auto-balances column heights.
//
// Column count per breakpoint:
//   <sm  : 1 col (mobile, full-width stack)
//   sm   : 2 cols
//   lg   : 3 cols
//   2xl+ : 4 cols
//
// InstallPromptPanel and LoveIslandShopPanel return null when not
// relevant (already installed / event off-season), so the order
// degrades gracefully without empty cards.
export function FarmInfoPage({
  data,
  now,
}: {
  data: FarmResponse;
  now: number;
}) {
  return (
    <div className="columns-1 gap-2 sm:columns-2 lg:columns-3 2xl:columns-4 *:break-inside-avoid *:mb-2">
      <BumpkinSummaryPanel data={data} />
      <InstallPromptPanel farmId={data.id} />
      <DeliveriesPanel state={data.farm} now={now} />
      <LoveIslandShopPanel state={data.farm} />
      <VillageProjectsPanel state={data.farm} />
      <PetCravingsPanel state={data.farm} />
      <PetsPanel state={data.farm} />
    </div>
  );
}
