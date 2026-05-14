/// <reference types="@cloudflare/workers-types" />

export type CategoryPrefs = Record<string, boolean>;

export type SubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  farmId: number;
  categories: CategoryPrefs;
  // Last cron tick this subscription was scanned. Push only fires for
  // timers where lastTickAt < readyAt <= now, so the same readyAt
  // never fires twice and a freshly-stored subscription doesn't
  // re-fire pre-existing ripe timers (we set lastTickAt = createdAt).
  lastTickAt: number;
  createdAt: number;
};

const KEY_PREFIX = "sub:";
// 30 days. Re-upserted on every UI save anyway; this catches abandoned
// subscriptions whose owner cleared site data without unsubscribing.
const TTL_SECONDS = 30 * 24 * 60 * 60;

async function endpointHash(endpoint: string): Promise<string> {
  const data = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function keyFor(endpoint: string): Promise<string> {
  return KEY_PREFIX + (await endpointHash(endpoint));
}

export async function getSub(
  kv: KVNamespace,
  endpoint: string,
): Promise<SubscriptionRecord | null> {
  return kv.get<SubscriptionRecord>(await keyFor(endpoint), "json");
}

export async function putSub(
  kv: KVNamespace,
  record: SubscriptionRecord,
): Promise<void> {
  await kv.put(await keyFor(record.endpoint), JSON.stringify(record), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function deleteSub(
  kv: KVNamespace,
  endpoint: string,
): Promise<void> {
  await kv.delete(await keyFor(endpoint));
}

export async function* listSubs(
  kv: KVNamespace,
): AsyncGenerator<SubscriptionRecord> {
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: KEY_PREFIX, cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    const records = await Promise.all(
      page.keys.map((k) => kv.get<SubscriptionRecord>(k.name, "json")),
    );
    for (const r of records) {
      if (r) yield r;
    }
  } while (cursor);
}
