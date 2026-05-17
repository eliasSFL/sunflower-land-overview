import { useState } from "react";

import { Button, Modal, SectionHeader } from "./ui/index.ts";
import { ActiveFarmPanel } from "./ActiveFarmPanel.tsx";
import { FarmIdForm } from "./FarmIdForm.tsx";
import { NotificationSettings } from "./NotificationSettings.tsx";
import { VipGate } from "./vip/VipGate.tsx";
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

// Modal opened by the floating gear. Two views:
//   1. Default — FARM (ActiveFarmPanel) + NOTIFICATIONS (sub-sections).
//   2. Switching — replaces the entire modal contents with the
//      FarmIdForm, with a Back button to return to the default view.
//      Tapping the ActiveFarmPanel flips into this view.
export function SettingsModal({
  open,
  onClose,
  farmId,
  data,
  onLoad,
  loading,
  error,
}: Props) {
  const [switching, setSwitching] = useState(false);

  // Reset on prop change via the React-docs prev-state idiom (cheaper
  // than useEffect + setState; no cascading render).
  //
  // 1. Modal closes → drop the switching view so reopening starts on
  //    the default Settings view.
  // 2. data.id changes → a successful load landed. Return to the
  //    default view. Failed loads leave data.id unchanged, so the
  //    user stays on the form and sees the error message.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open && switching) setSwitching(false);
  }
  const [prevDataId, setPrevDataId] = useState(data.id);
  if (prevDataId !== data.id) {
    setPrevDataId(data.id);
    if (switching) setSwitching(false);
  }

  if (switching) {
    return (
      <Modal open={open} onClose={onClose} title="Switch Farm">
        <FarmIdForm
          initialFarmId={farmId}
          onSubmit={onLoad}
          loading={loading}
          lastLoaded={{ farmId }}
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button onClick={() => setSwitching(false)}>Back</Button>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <section className="flex flex-col gap-2">
        <SectionHeader>Farm</SectionHeader>
        <ActiveFarmPanel data={data} onSwitch={() => setSwitching(true)} />
        <Button
          onClick={() =>
            window.open(
              "https://sunflower-land.com/play",
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          Open Sunflower Land
        </Button>
      </section>
      <VipGate farmId={data.id}>
        {({ badge }) => (
          <NotificationSettings farmId={data.id} badge={badge} />
        )}
      </VipGate>
    </Modal>
  );
}
