// Fetch helpers for the Worker's /push/* routes. No auth header — the
// Worker mints its own per-farm community key from the master secret.

export type SubscribeBody = {
  farmId: number;
  subscription: PushSubscriptionJSON;
  mutedCategories?: string[];
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
// PWA, so the DO can re-fetch its own snapshot and re-schedule timer
// fires immediately instead of waiting for the next 10-min coordinator
// sweep. Caller should swallow errors — this is best-effort.
export async function postRefresh(body: { farmId: number }): Promise<Response> {
  return fetch("/push/refresh", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
