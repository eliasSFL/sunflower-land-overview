/// <reference types="@cloudflare/workers-types" />

// KV layout for push subscriptions.
//
// Key:   `sub:<sha256(endpoint)>` — endpoint is unique per-device per-
//        push-service, sha256 keeps the key short and printable.
// Value: SubscriptionRecord (JSON)
//
// The record stores the schedule the client computed. The scheduler
// looks for entries whose `readyAt` falls inside (lastTickAt, now] and
// fires a push. Schedule entries are also pruned once their readyAt
// has been processed, so KV size stays bounded by active timer count.

export type Category =
  | "Crops"
  | "Fruit Patches"
  | "Greenhouse"
  | "Crop Machine"
  | "Flowers"
  | "Beehives"
  | "Resources";

export type ScheduleEntry = {
  key: string;
  category: Category;
  label: string;
  icon?: string;
  readyAt: number;
};

export type SubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  farmId: number;
  categories: Record<Category, boolean>;
  schedule: ScheduleEntry[];
  lastTickAt: number;
  createdAt: number;
};

export async function endpointKey(endpoint: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `sub:${hex}`;
}

export async function getSubscription(
  kv: KVNamespace,
  endpoint: string,
): Promise<SubscriptionRecord | null> {
  const k = await endpointKey(endpoint);
  return kv.get<SubscriptionRecord>(k, "json");
}

export async function putSubscription(
  kv: KVNamespace,
  record: SubscriptionRecord,
): Promise<void> {
  const k = await endpointKey(record.endpoint);
  // 30-day TTL: a device that doesn't re-sync in a month is almost
  // certainly stale (uninstalled PWA, browser cache cleared, etc.).
  // Active devices re-sync on every farm refresh.
  await kv.put(k, JSON.stringify(record), { expirationTtl: 30 * 24 * 60 * 60 });
}

export async function deleteSubscription(
  kv: KVNamespace,
  endpoint: string,
): Promise<void> {
  const k = await endpointKey(endpoint);
  await kv.delete(k);
}

export async function listSubscriptions(
  kv: KVNamespace,
): Promise<SubscriptionRecord[]> {
  const out: SubscriptionRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const rec = await kv.get<SubscriptionRecord>(k.name, "json");
      if (rec) out.push(rec);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
