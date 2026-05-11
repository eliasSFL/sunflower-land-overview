/// <reference types="@cloudflare/workers-types" />

// HTTP routes for the push pipeline. Mounted by `worker/index.ts` under
// `/api/push/*`. Three endpoints:
//
//   GET  /api/push/vapid-public   → { key: <base64url> }
//   POST /api/push/subscribe      → upserts a SubscriptionRecord in KV
//   POST /api/push/unsubscribe    → removes a SubscriptionRecord
//
// We deliberately don't authenticate these routes with the user's SFL
// API key: the push subscription's endpoint URL itself is the secret
// (it's a long random path issued by the push service). Anyone who
// can guess a valid endpoint is already authorized to push to it.

import type { Category, ScheduleEntry, SubscriptionRecord } from "./storage.ts";
import {
  deleteSubscription,
  getSubscription,
  putSubscription,
} from "./storage.ts";

export type PushEnv = {
  PUSH_SUBS?: KVNamespace;
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  VAPID_SUBJECT?: string;
};

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function isPushSubscriptionJSON(x: unknown): x is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.endpoint !== "string") return false;
  const keys = o.keys as Record<string, unknown> | undefined;
  return (
    !!keys && typeof keys.p256dh === "string" && typeof keys.auth === "string"
  );
}

const CATEGORIES: Category[] = [
  "Crops",
  "Fruit Patches",
  "Greenhouse",
  "Crop Machine",
  "Flowers",
  "Beehives",
  "Resources",
];

function sanitizeCategories(input: unknown): Record<Category, boolean> {
  const out = {} as Record<Category, boolean>;
  for (const c of CATEGORIES) out[c] = true;
  if (!input || typeof input !== "object") return out;
  const o = input as Record<string, unknown>;
  for (const c of CATEGORIES) {
    if (typeof o[c] === "boolean") out[c] = o[c] as boolean;
  }
  return out;
}

function sanitizeSchedule(input: unknown): ScheduleEntry[] {
  if (!Array.isArray(input)) return [];
  const out: ScheduleEntry[] = [];
  const now = Date.now();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const readyAt = Number(r.readyAt);
    if (!Number.isFinite(readyAt)) continue;
    if (readyAt <= now) continue;
    const category = r.category as Category;
    if (!CATEGORIES.includes(category)) continue;
    if (typeof r.key !== "string" || typeof r.label !== "string") continue;
    out.push({
      key: r.key,
      category,
      label: r.label,
      icon: typeof r.icon === "string" ? r.icon : undefined,
      readyAt,
    });
    // Cap per-subscription schedule size so a malformed client can't
    // explode KV value sizes. 500 entries covers any realistic farm.
    if (out.length >= 500) break;
  }
  return out;
}

export async function handlePushRoute(
  request: Request,
  env: PushEnv,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/push/")) return null;

  if (url.pathname === "/api/push/vapid-public" && request.method === "GET") {
    if (!env.VAPID_PUBLIC) {
      return json(
        { error: "Push is not configured on this server" },
        { status: 503 },
      );
    }
    return json({ key: env.VAPID_PUBLIC });
  }

  if (!env.PUSH_SUBS) {
    return json({ error: "Push storage is not configured" }, { status: 503 });
  }

  if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const b = body as Record<string, unknown> | null;
    if (!b || !isPushSubscriptionJSON(b.subscription)) {
      return json({ error: "Invalid subscription" }, { status: 400 });
    }
    const farmId = Number(b.farmId);
    if (!Number.isFinite(farmId) || farmId <= 0) {
      return json({ error: "Invalid farmId" }, { status: 400 });
    }
    const existing = await getSubscription(
      env.PUSH_SUBS,
      b.subscription.endpoint,
    );
    const record: SubscriptionRecord = {
      endpoint: b.subscription.endpoint,
      keys: b.subscription.keys,
      farmId,
      categories: sanitizeCategories(b.categories),
      schedule: sanitizeSchedule(b.schedule),
      // Preserve lastTickAt across re-subscribes so a re-sync mid-cycle
      // doesn't cause us to re-fire notifications already delivered.
      lastTickAt: existing?.lastTickAt ?? Date.now(),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await putSubscription(env.PUSH_SUBS, record);
    return json({ ok: true });
  }

  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const endpoint = (body as { endpoint?: unknown })?.endpoint;
    if (typeof endpoint !== "string") {
      return json({ error: "Invalid endpoint" }, { status: 400 });
    }
    await deleteSubscription(env.PUSH_SUBS, endpoint);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, { status: 404 });
}
