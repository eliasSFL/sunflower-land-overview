/// <reference types="@cloudflare/workers-types" />

// Cron handler — fires every minute. For each subscription:
//   1. Find schedule entries that fell into (lastTickAt, now] and are
//      in an opted-in category.
//   2. Send a Web Push for each such entry.
//   3. Update the record: lastTickAt = now, schedule = entries with
//      readyAt > now (drop past entries).
//   4. If the push service returns 404/410 ("subscription gone"),
//      delete the KV record so we don't keep retrying forever.
//
// Per-tick work is parallelized with Promise.allSettled, but capped at
// MAX_PUSHES so a misconfigured client can't fan out indefinitely.

import {
  sendPush,
  type PushSubscriptionRecord,
  type VapidConfig,
} from "./push.ts";
import {
  deleteSubscription,
  listSubscriptions,
  putSubscription,
  type ScheduleEntry,
  type SubscriptionRecord,
} from "./storage.ts";
import type { PushEnv } from "./routes.ts";

const MAX_PUSHES_PER_TICK = 200;

function buildPayload(entry: ScheduleEntry): Uint8Array<ArrayBuffer> {
  // Payload shape mirrors what `public/sw.js` expects.
  const payload = {
    title: `${entry.category}: ${entry.label} ready`,
    body: "Open Sunflower Land Overview to harvest.",
    icon: entry.icon ?? "/icons/sfl_overview-192.webp",
    tag: entry.key,
    url: "/",
  };
  const json = JSON.stringify(payload);
  const buf = new ArrayBuffer(json.length * 4); // worst-case UTF-8
  const out = new Uint8Array(buf);
  const written = new TextEncoder().encodeInto(json, out).written ?? 0;
  return out.subarray(0, written) as Uint8Array<ArrayBuffer>;
}

export async function runScheduled(env: PushEnv, now: number): Promise<void> {
  if (
    !env.PUSH_SUBS ||
    !env.VAPID_PUBLIC ||
    !env.VAPID_PRIVATE ||
    !env.VAPID_SUBJECT
  ) {
    // Nothing to do — push not configured. Logged once via observability.
    console.warn("[push] scheduled tick skipped: missing env");
    return;
  }
  const vapid: VapidConfig = {
    publicKey: env.VAPID_PUBLIC,
    privateKey: env.VAPID_PRIVATE,
    subject: env.VAPID_SUBJECT,
  };
  const subs = await listSubscriptions(env.PUSH_SUBS);

  type Job = { record: SubscriptionRecord; entry: ScheduleEntry };
  const jobs: Job[] = [];
  const updated = new Map<string, SubscriptionRecord>();

  for (const rec of subs) {
    const fires: ScheduleEntry[] = [];
    const future: ScheduleEntry[] = [];
    for (const e of rec.schedule) {
      if (e.readyAt > now) {
        future.push(e);
        continue;
      }
      if (e.readyAt > rec.lastTickAt && rec.categories[e.category]) {
        fires.push(e);
      }
      // Past entries not in (lastTickAt, now] are stale (e.g. we missed
      // a cron tick) — drop silently to avoid late-firing.
    }
    const next: SubscriptionRecord = {
      ...rec,
      schedule: future,
      lastTickAt: now,
    };
    updated.set(rec.endpoint, next);
    for (const e of fires) jobs.push({ record: rec, entry: e });
    if (jobs.length >= MAX_PUSHES_PER_TICK) break;
  }

  const sliced = jobs.slice(0, MAX_PUSHES_PER_TICK);
  const results = await Promise.allSettled(
    sliced.map(async ({ record, entry }) => {
      const sub: PushSubscriptionRecord = {
        endpoint: record.endpoint,
        keys: record.keys,
      };
      const resp = await sendPush(vapid, sub, buildPayload(entry));
      return { endpoint: record.endpoint, status: resp.status };
    }),
  );

  // Drop subscriptions the push service has retired.
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { endpoint, status } = r.value;
    if (status === 404 || status === 410) {
      await deleteSubscription(env.PUSH_SUBS, endpoint);
      updated.delete(endpoint);
    }
  }

  for (const rec of updated.values()) {
    await putSubscription(env.PUSH_SUBS, rec);
  }
}
