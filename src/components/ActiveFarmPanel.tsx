import { ButtonPanel, Label } from "./ui/index.ts";
import type { FarmResponse } from "../api/fetchFarm.ts";

type Props = {
  data: FarmResponse;
  onSwitch: () => void;
};

// Read-only "Active Farm" display rendered as a clickable ButtonPanel.
// Clicking the whole row triggers `onSwitch`, which the parent uses to
// swap the entire SettingsModal contents over to the FarmIdForm.
export function ActiveFarmPanel({ data, onSwitch }: Props) {
  return (
    <ButtonPanel
      role="button"
      tabIndex={0}
      onClick={onSwitch}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSwitch();
        }
      }}
      className="flex items-center gap-3 cursor-pointer"
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs uppercase tracking-wider opacity-80">
          Active Farm
        </span>
        <span className="text-base truncate">#{data.id}</span>
        {data.nft_id || data.nftId || data.isBlacklisted ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {data.nft_id || data.nftId ? (
              <Label type="info">NFT {data.nft_id ?? data.nftId}</Label>
            ) : null}
            {data.isBlacklisted ? (
              <Label type="danger">blacklisted</Label>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="text-xs uppercase tracking-wider opacity-70 shrink-0">
        Switch
      </span>
    </ButtonPanel>
  );
}
