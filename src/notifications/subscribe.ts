// Client side of the Web Push pipeline.
//
// Architecture choice — "client computes, server schedules":
//   The Worker doesn't re-extract timers from the SFL API. It would
//   have to bundle the full sunflower-land submodule (huge, full of
//   asset imports) and re-fetch farm state with the user's API key
//   (which we'd then have to store at rest). Instead, the client —
//   which already computes every readyAt — POSTs the schedule to the
//   Worker alongside the push subscription. The Worker just persists
//   the list and fires push for entries whose readyAt has passed since
//   the last cron tick.
//
// Re-sync triggers:
//   - User toggles the master switch or a category   → syncSchedule
//   - `App.tsx` refreshes farm data                  → syncSchedule
//   - Permission revoked / unsubscribe button        → unsubscribePush

import type { AggregatedTimer, Category } from "../timers/index.ts";

export type ScheduleEntry = {
  key: string;
  category: Category;
  label: string;
  icon?: string;
  readyAt: number;
};

export type SubscribePayload = {
  subscription: PushSubscriptionJSON;
  farmId: number;
  categories: Record<Category, boolean>;
  schedule: ScheduleEntry[];
};

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function toSchedule(timers: AggregatedTimer[]): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  for (const t of timers) {
    // Past-ready entries are not useful to schedule — they wouldn't
    // produce a future transition. Server-side dedupe by `tag` would
    // also collapse them.
    if (t.readyAt <= Date.now()) continue;
    out.push({
      key: t.aggregationKey ?? `${t.category}|${t.label}`,
      category: t.category,
      label: t.label,
      icon: t.icon,
      readyAt: t.readyAt,
    });
  }
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function fetchVapidPublicKey(): Promise<
  Uint8Array<ArrayBuffer> | undefined
> {
  try {
    const r = await fetch("/api/push/vapid-public", { method: "GET" });
    if (!r.ok) return undefined;
    const { key } = (await r.json()) as { key?: string };
    if (!key) return undefined;
    return urlBase64ToUint8Array(key);
  } catch {
    return undefined;
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribePush(
  farmId: number,
  categories: Record<Category, boolean>,
  schedule: ScheduleEntry[],
): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported on this device");
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await fetchVapidPublicKey();
    if (!key) {
      throw new Error(
        "Push is not configured on the server (missing VAPID public key)",
      );
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }
  await postSchedule({
    subscription: sub.toJSON(),
    farmId,
    categories,
    schedule,
  });
  return sub;
}

export async function syncSchedule(
  farmId: number,
  categories: Record<Category, boolean>,
  schedule: ScheduleEntry[],
): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await postSchedule({
    subscription: sub.toJSON(),
    farmId,
    categories,
    schedule,
  });
}

async function postSchedule(payload: SubscribePayload): Promise<void> {
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`subscribe failed: ${r.status}`);
  }
}

export async function unsubscribePush(): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } finally {
    await sub.unsubscribe();
  }
}
