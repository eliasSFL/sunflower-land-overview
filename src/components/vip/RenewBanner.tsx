import { useState } from "react";

import type { VipStatus } from "../../notifications/vipApi.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  status: VipStatus;
  onRenew: () => void;
};

export function RenewBanner({ status, onRenew }: Props) {
  // Date.now() via useState init to keep the call out of the render-
  // purity check. Banner is coarse-grained day-count; frozen from
  // mount is fine.
  const [now] = useState(() => Date.now());
  if (!status.inGrace || !status.graceUntil) return null;
  const daysLeft = Math.max(0, Math.ceil((status.graceUntil - now) / DAY_MS));
  return (
    <div className="rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
      <strong>Subscription expired.</strong> Notifications continue for{" "}
      {daysLeft} more day{daysLeft === 1 ? "" : "s"}. Renew now to avoid a
      gap.
      <button
        type="button"
        onClick={onRenew}
        className="ml-2 underline cursor-pointer"
      >
        Renew $1
      </button>
    </div>
  );
}
