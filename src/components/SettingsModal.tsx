import { Modal, Label } from "./ui/index.ts";
import { FarmIdForm } from "./FarmIdForm.tsx";
import { NotificationSettings } from "./NotificationSettings.tsx";
import type { FarmResponse } from "../api/fetchFarm.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  farmId: string;
  data: FarmResponse;
  onLoad: (id: string) => void;
  loading: boolean;
  error?: string;
};

// Modal opened by the floating gear. Contains both the Farm ID
// management (mirrors the main game's Game Options panel) and the
// Notification settings. Owned by App.tsx.
export function SettingsModal({
  open,
  onClose,
  farmId,
  data,
  onLoad,
  loading,
  error,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <section className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Farm</span>
        <div className="flex flex-wrap items-center gap-2">
          <Label type="default">Farm #{data.id}</Label>
          {data.nft_id || data.nftId ? (
            <Label type="info">NFT {data.nft_id ?? data.nftId}</Label>
          ) : null}
          {data.isBlacklisted ? <Label type="danger">blacklisted</Label> : null}
        </div>
        <FarmIdForm
          initialFarmId={farmId}
          onSubmit={onLoad}
          loading={loading}
          lastLoaded={{ farmId }}
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </section>
      <div className="my-2 border-t border-[#3e2731]/30" />
      <section className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Notifications</span>
        <NotificationSettings farmId={data.id} />
      </section>
    </Modal>
  );
}
