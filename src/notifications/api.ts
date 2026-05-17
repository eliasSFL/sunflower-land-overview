// Fetch helpers for the Worker's /push/* routes. No auth header — the
// Worker mints its own per-farm community key from the master secret.

export type NotificationTarget = "overview" | "play";

export type SubscribeBody = {
  farmId: number;
  subscription: PushSubscriptionJSON;
  mutedCategories?: string[];
  notificationTarget?: NotificationTarget;
};

const JSON_HEADERS = { "content-type": "application/json" } as const;

export async function getVapid(): Promise<{ publicKey: string }> {
  const res = await fetch("/push/vapid");
  if (!res.ok) throw new Error(`vapid: ${res.status}`);
  return (await res.json()) as { publicKey: string };
}

export async function postSubscribe(body: SubscribeBody): Promise<Response> {
  return fetch("/push/subscribe", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postUnsubscribe(body: {
  farmId: number;
  endpoint: string;
}): Promise<Response> {
  return fetch("/push/unsubscribe", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postCategories(body: {
  farmId: number;
  endpoint: string;
  mutedCategories: string[];
}): Promise<Response> {
  return fetch("/push/categories", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postNotificationTarget(body: {
  farmId: number;
  endpoint: string;
  notificationTarget: NotificationTarget;
}): Promise<Response> {
  return fetch("/push/target", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postTest(body: {
  farmId: number;
  endpoint: string;
}): Promise<Response> {
  return fetch("/push/test", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

// Fire-and-forget hint to the DO that the player just refreshed in the
// PWA, so the DO can re-schedule timer fires immediately instead of
// waiting for the next 10-min coordinator sweep. Caller should swallow
// errors — this is best-effort.
//
// `snapshot` carries the raw farm payload the SPA just received from
// `/api/farms/{id}`, so the DO can apply it directly without a second
// upstream fetch. This avoids the BE per-IP throttle on the shared
// Worker egress IP and removes the cross-device staleness window that
// existed when the DO refetched on its own (and short-circuited if it
// had a snapshot < 30s old). Omitted ⇒ DO falls back to refetching.
export async function postRefresh(body: {
  farmId: number;
  endpoint: string;
  snapshot?: string;
}): Promise<Response> {
  return fetch("/push/refresh", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
