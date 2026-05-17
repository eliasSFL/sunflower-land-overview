import { useState } from "react";

import { Label } from "../ui/index.ts";
import type { VipStatus } from "../../notifications/vipApi.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / DAY_MS));
}

export function VipStatusBadge({ status }: { status: VipStatus }) {
  // useState init defers the Date.now() read out of the render-time
  // purity check. The badge is fine showing a "frozen" now from mount —
  // it's a coarse day-count, not a live countdown.
  const [now] = useState(() => Date.now());
  if (status.inGrace && status.graceUntil) {
    return (
      <Label type="warning">Grace · {daysLeft(status.graceUntil, now)}d</Label>
    );
  }
  if (status.isVip && status.expiresAt) {
    const onTrial =
      status.trialUsedAt !== null &&
      status.expiresAt - status.trialUsedAt < 31 * DAY_MS;
    const label = onTrial ? "Trial" : "VIP";
    return (
      <Label type="success">
        {label} · {daysLeft(status.expiresAt, now)}d
      </Label>
    );
  }
  return <Label type="warning">Not subscribed</Label>;
}
