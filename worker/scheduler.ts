/// <reference types="@cloudflare/workers-types" />

import { extractAllTimers } from "../src/timers/index.ts";
import type { GameState } from "../src/game/index.ts";
import { getFarmsBatch, MAX_BATCH } from "./community-api.ts";
import { sendPush, type Vapid } from "./push.ts";
import {
  deleteSub,
  listSubs,
  putSub,
  type SubscriptionRecord,
} from "./subscriptions.ts";

export type Env = {
  PUSH_SUBS?: KVNamespace;
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  VAPID_SUBJECT?: string;
  SFL_COMMUNITY_API_KEY?: string;
};

export function hasPushBindings(env: Env): boolean {
  return Boolean(
    env.PUSH_SUBS &&
      env.VAPID_PUBLIC &&
      env.VAPID_PRIVATE &&
      env.VAPID_SUBJECT &&
      env.SFL_COMMUNITY_API_KEY,
  );
}

function getVapid(env: Env): Vapid {
  return {
    publicKey: env.VAPID_PUBLIC!,
    privateKey: env.VAPID_PRIVATE!,
    subject: env.VAPID_SUBJECT!,
  };
}

// Compose a per-push payload. Keeps the SW handler simple (parses
// JSON, calls showNotification).
function buildPayload(timer: {
  category: string;
  label: string;
  amount?: number;
}): {
  title: string;
  body: string;
  tag: string;
  url: string;
} {
  const amount = timer.amount && timer.amount > 1 ? ` ×${timer.amount}` : "";
  return {
    title: `${timer.category} ready`,
    body: `${timer.label}${amount}`,
    // Same key replaces the previous notification rather than stacking
    // — one row "is ready" rather than one notification per crossing
    // on a busy farm.
    tag: `${timer.category}|${timer.label}`,
    url: "/",
  };
}

async function processFarm(
  env: Env,
  vapid: Vapid,
  subs: SubscriptionRecord[],
  state: GameState,
  farmId: number,
  now: number,
): Promise<void> {
  const timers = extractAllTimers(state, farmId, now);

  for (const sub of subs) {
    const ripe = timers.filter(
      (t) =>
        !t.idle &&
        t.readyAt > sub.lastTickAt &&
        t.readyAt <= now &&
        sub.categories[t.category] !== false,
    );

    let prune = false;
    for (const t of ripe) {
      const res = await sendPush(
        { endpoint: sub.endpoint, keys: sub.keys },
        buildPayload(t),
        vapid,
      );
      if (res.status === 404 || res.status === 410) {
        prune = true;
        break;
      }
    }

    if (prune) {
      await deleteSub(env.PUSH_SUBS!, sub.endpoint);
      continue;
    }
    await putSub(env.PUSH_SUBS!, { ...sub, lastTickAt: now });
  }
}

export async function runScheduledTick(env: Env): Promise<void> {
  if (!hasPushBindings(env)) return;
  const vapid = getVapid(env);

  // Group subscriptions by farmId so each farm is fetched once even
  // when a user has multiple devices.
  const byFarm = new Map<number, SubscriptionRecord[]>();
  for await (const sub of listSubs(env.PUSH_SUBS!)) {
    const list = byFarm.get(sub.farmId) ?? [];
    list.push(sub);
    byFarm.set(sub.farmId, list);
  }
  if (byFarm.size === 0) return;

  const farmIds = Array.from(byFarm.keys());
  const now = Date.now();

  for (let i = 0; i < farmIds.length; i += MAX_BATCH) {
    const batch = farmIds.slice(i, i + MAX_BATCH);
    const resp = await getFarmsBatch(env.SFL_COMMUNITY_API_KEY!, batch);
    if (!resp) return; // throttled — bail this tick

    for (const [idStr, raw] of Object.entries(resp.farms)) {
      if (!raw) continue;
      const id = Number(idStr);
      const subs = byFarm.get(id);
      if (!subs) continue;
      await processFarm(env, vapid, subs, raw as GameState, id, now);
    }
  }
}
