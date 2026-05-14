import type { Category } from "../timers/types.ts";

export type CategoryPrefs = Partial<Record<Category, boolean>>;

// Body sent to /api/push/subscribe. Deliberately contains no API key
// and no readyAt schedule — the Worker fetches farm state itself via
// /community/getFarms using a shared community key, then computes
// ready transitions on its cron loop.
export type SubscribeBody = {
  subscription: PushSubscriptionJSON;
  farmId: number;
  categories: CategoryPrefs;
};

export async function postSubscribe(body: SubscribeBody): Promise<Response> {
  return fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteSubscribe(endpoint: string): Promise<Response> {
  return fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export async function postTestPush(endpoint: string): Promise<Response> {
  return fetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}
