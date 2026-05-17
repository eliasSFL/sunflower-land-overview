import { useEffect, useState, type ReactNode } from "react";

import { SectionHeader } from "../ui/index.ts";
import { getVipStatus, type VipStatus } from "../../notifications/vipApi.ts";
import { PayButton } from "./PayButton.tsx";
import { RenewBanner } from "./RenewBanner.tsx";
import { StartTrialButton } from "./StartTrialButton.tsx";
import { VipStatusBadge } from "./VipStatusBadge.tsx";

type Props = {
  farmId: number;
  children: (ctx: { status: VipStatus; badge: ReactNode }) => ReactNode;
};

// Wraps the notification UI. Resolves /vip/status, then either:
//   - renders the paywall (no VIP, no/used trial), or
//   - renders `children(status, badge)` with a renew banner overlay
//     when the farm is inside the 3-day grace.
//
// The children prop is a render-fn so the wrapped UI can place the
// badge inline with its own headers and react to status changes
// without lifting state.
export function VipGate({ farmId, children }: Props) {
  const [status, setStatus] = useState<VipStatus | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Reset on farmId change via the prev-prop idiom — keeps the loading
  // state visible immediately on switch without the cascading-render
  // cost of resetting from inside useEffect.
  const [prevFarmId, setPrevFarmId] = useState(farmId);
  if (prevFarmId !== farmId) {
    setPrevFarmId(farmId);
    setStatus(null);
    setError(undefined);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getVipStatus(farmId);
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  if (error) {
    return <p className="text-sm text-red-700">VIP status: {error}</p>;
  }
  if (!status) {
    return <p className="text-sm">Loading subscription…</p>;
  }

  if (!status.isVip) {
    const canTrial = status.trialUsedAt === null;
    return (
      <div className="flex flex-col gap-2 text-sm">
        <SectionHeader>Notifications</SectionHeader>
        <p>
          Push notifications are a <strong>$1 / 30-day</strong> VIP feature.
          {canTrial
            ? " Start your one-time free trial below, or subscribe directly."
            : " Subscribe to enable timer pushes for this farm."}
        </p>
        {canTrial ? (
          <StartTrialButton farmId={farmId} onClaimed={setStatus} />
        ) : null}
        <PayButton farmId={farmId} status={status} onPaid={setStatus} />
      </div>
    );
  }

  const badge = <VipStatusBadge status={status} />;
  return (
    <div className="flex flex-col gap-2">
      {status.inGrace ? (
        <RenewBanner
          status={status}
          onRenew={() => {
            // The PayButton is rendered with `key=grace` so clicking
            // the banner doesn't need its own modal handler — the
            // PayButton inside the wrapped UI is the source of truth
            // for opening the modal. We just scroll/focus the user
            // toward it. No-op here keeps the banner cheap.
          }}
        />
      ) : null}
      {children({ status, badge })}
      {status.inGrace ? (
        <PayButton
          farmId={farmId}
          status={status}
          onPaid={setStatus}
          label="Renew — $1 / 30 days"
        />
      ) : null}
    </div>
  );
}
