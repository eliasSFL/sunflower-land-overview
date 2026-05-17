import { useState } from "react";

import { Button } from "../ui/index.ts";
import {
  postVipTrial,
  type VipStatus,
} from "../../notifications/vipApi.ts";

type Props = {
  farmId: number;
  onClaimed: (status: VipStatus) => void;
};

export function StartTrialButton({ farmId, onClaimed }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onClick() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await postVipTrial(farmId);
      if (!result.ok) {
        // Trial already burned. Surface the current status so the gate
        // re-renders into the "paywall" branch immediately.
        onClaimed(result.status);
        setError("Trial already used for this farm.");
        return;
      }
      onClaimed(result.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={onClick} disabled={busy}>
        Start free trial (30 days)
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
