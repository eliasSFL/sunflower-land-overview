/// <reference types="@cloudflare/workers-types" />

import { Agent } from "agents";
import { sendAll } from "./push.ts";
import { getFarm, mintFarmKey } from "./communityApi.ts";
import { addOptIn, removeOptIn } from "./registry.ts";
import { makeGame } from "../src/game/index.ts";
import { extractAndAggregate } from "../src/timers/index.ts";
import { detectCompletedProjects } from "../src/notifications/villageProjects.ts";
import { clusterReadyAts } from "../src/timers/cluster.ts";
import { planReadyDigest, type DigestMember } from "./readyDigest.ts";
import type { AggregatedTimer } from "../src/timers/types.ts";
import type {
  Env,
  StoredSubscription,
  SubscribeBody,
  CategoriesBody,
  TargetBody,
  NotificationTarget,
  PushPayload,
  PendingFire,
  FirePayload,
  SnapshotEnvelope,
} from "./types.ts";

// Click-target URLs. "overview" stays in the PWA on the current
// origin; "play" jumps to the main game.
const PLAY_URL = "https://sunflower-land.com/play";

function clickUrl(
  target: NotificationTarget | undefined,
  farmId: number | null,
): string {
  if (target === "play") return PLAY_URL;
  return `/?farmId=${farmId ?? ""}`;
}

// Round yield amounts to 2 decimal places, strip trailing zeros so
// notification bodies don't show JS float garbage like "4.8000000002".
function formatAmount(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

// Format the per-cluster headline for an `instances`-based aggregate.
// See the caller comment for the chosen forms.
function clusterHeadline(
  t: AggregatedTimer,
  item: string,
  amount: number,
  count: number,
): string {
  if (amount <= 0) {
    return count > 1 ? `${count}× ${t.label}` : t.label;
  }
  const base = `${formatAmount(amount)} ${item}`;
  if (count <= 1) return base;
  // Prefer a distinct node noun when the extractor supplied one
  // (Wood→Tree, Egg→Chicken, Obsidian→Lava Pit). Fall back to a
  // bare "(×N)" suffix when the node and the item share a name
  // (a Sunflower plot produces Sunflower) — leading with "from N×
  // Sunflower" would just read as redundancy.
  if (t.nodeLabel && t.nodeLabel !== item) {
    return `${base} from ${count}× ${t.nodeLabel}`;
  }
  return `${base} (×${count})`;
}

// Derive the list of (fireKey, payload) entries for one aggregated
// timer. Three branches:
//
//   * `slots[]` present  → per-slot fires (cooking, aging, crafting).
//     Each slot already has its own item identity and readyAt.
//   * `instances[]` set  → multi-plot plant/animal/resource. Cluster
//     adjacent readyAts within CLUSTER_WINDOW_MS so e.g. a player who
//     plants 5 zucchini in one in-game session gets ONE "5× Zucchini
//     ready" push instead of five back-to-back notifications. The
//     cluster's yield is the sum of its members' per-instance amounts
//     (tracked in `instances[].amount`), so the body can surface the
//     wave's actual yield rather than dropping it.
//   * Neither            → single-instance timer (beehives, lone
//     plots). Keeps the prior yield headline format.
//
// The fireKey embeds `readyAt` so multiple ripening waves for the
// same aggregation key get distinct dedup keys.
function instancesFor(t: AggregatedTimer): Omit<PendingFire, "scheduleId">[] {
  const aggKey = t.aggregationKey ?? t.id;
  const out: Omit<PendingFire, "scheduleId">[] = [];

  if (t.slots && t.slots.length > 0) {
    // Include the slot index so two batches in the same rack with the
    // same item + readyAt (e.g. starting two identical aging shed
    // recipes simultaneously) don't collide on fireKey and drop one
    // of the fires. Cooking aggKeys already include slotIdx so the
    // index is redundant there but harmless.
    t.slots.forEach((s, i) => {
      out.push({
        fireKey: `${aggKey}#${s.item}@${s.readyAt}#${i}`,
        readyAt: s.readyAt,
        title: `${s.item} ready`,
        body: `${t.label} · ${t.category}`,
        icon: s.icon ?? t.icon,
        category: t.category,
        count: 1,
      });
    });
    return out;
  }

  if (t.instances && t.instances.length > 0) {
    const item = t.predictedYield?.item ?? t.label;
    for (const c of clusterReadyAts(t.instances, CLUSTER_WINDOW_MS)) {
      // Avoid the "{N}× {amount} {item}" form here — players read it as
      // multiplication ("3× 4.2 Wood" → 12.6 Wood). Lead with the
      // amount instead, and qualify the count with the source noun:
      //   "4.2 Wood from 3× Tree"   (nodeLabel ≠ item)
      //   "12 Sunflower (×5)"       (nodeLabel absent; node == item)
      //   "1.4 Wood"                (single ripening in this cluster)
      const headline = clusterHeadline(t, item, c.amount, c.count);
      out.push({
        fireKey: `${aggKey}@${c.readyAt}`,
        readyAt: c.readyAt,
        title: `${t.label} ready`,
        body: `${headline} · ${t.category}`,
        icon: t.icon,
        category: t.category,
        count: c.count,
      });
    }
    return out;
  }

  // Single-instance fallback: matches the pre-fix headline format so
  // a lone beehive/plot still surfaces its predicted yield. When the
  // timer carries an explicit `nodeCount` (crop machine packs report
  // their seed input), append a "from N× nodeLabel" suffix so the
  // body reads "900 Sunflower from 300× seeds" — same shape as the
  // cluster format used for trees/chickens/etc.
  const prefix = t.count > 1 ? `${t.count}× ` : "";
  const base = t.predictedYield
    ? `${prefix}${formatAmount(t.predictedYield.amount)} ${t.predictedYield.item}`
    : `${prefix}${t.label}`;
  const source =
    t.nodeCount !== undefined && t.nodeLabel
      ? ` from ${t.nodeCount}× ${t.nodeLabel}`
      : "";
  const headline = `${base}${source}`;
  // Honour per-timer push wording overrides when the default
  // "{label} ready" / "{headline} · {category}" framing doesn't fit
  // (Love Island headsup pushes are the current users). The schedule
  // diff in `applySnapshot` compares the resolved title/body so
  // changing these between code versions naturally reschedules.
  out.push({
    fireKey: `${aggKey}@${t.readyAt}`,
    readyAt: t.readyAt,
    title: t.pushTitle ?? `${t.label} ready`,
    body: t.pushBody ?? `${headline} · ${t.category}`,
    icon: t.icon,
    category: t.category,
    count: t.count,
  });
  return out;
}

// Skip the upstream fetch in `refreshFromUpstream` if our snapshot is
// fresher than this. Limits how often a single farm's clients can drive
// real upstream traffic via /push/refresh.
const REFRESH_TTL_MS = 30_000;

// On a "wasEmpty" subscribe, skip the warm upstream fetch if we already
// have a recent snapshot. Sub→unsub→sub loops would otherwise refire
// upstream every cycle. The coordinator's *\/10 * cron catches genuinely
// new farms within ≤10 min.
const WARM_FETCH_TTL_MS = 5 * 60 * 1000;

// Hard cap on stored subscriptions per farm. A pathological caller
// could otherwise drive both DO state and per-fire push fan-out
// unboundedly. 10 is loose enough for a family on multiple devices,
// tight enough to neutralize abuse. Re-subscribing the same endpoint
// is dedup'd before this check.
const MAX_SUBSCRIPTIONS_PER_FARM = 10;

// Idle subscriptions self-vacuum after this long without observed
// activity (subscribe, /push/state pull, /push/refresh, successful
// push delivery). Real players either keep the PWA open occasionally
// or receive successful pushes — anything quieter than this is
// effectively churned and we recycle the D1 row + DO state.
const OPT_IN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Sliding window for clustering per-instance ripening events into one
// push. A player who plants several pots seconds apart gets one
// "N× Item ready" notification per cluster; pots planted hours apart
// get separate pushes. See src/timers/cluster.ts.
const CLUSTER_WINDOW_MS = 60_000;

// Soft cap on scheduled fires per DO. A whale farm with hundreds of
// plots × multiple crops could otherwise balloon DO state past the
// 128 KB per-value storage limit. Each PendingFire is ~200 bytes;
// 200 entries = ~40 KB, well under the limit with headroom for the
// rest of state. When exceeded, the earliest readyAts win and the
// rest are dropped with a warning.
const MAX_SCHEDULED_PER_DO = 200;

// How long an entry in `notified` survives. Was 24h when the value
// stored `readyAt` — too short for our seeded-on-subscribe entries
// (which carry ancient readyAts and would GC out on the next fire,
// then the next sweep would re-fire them). Now the value is
// `recordedAt` and 7 days is enough for any genuinely un-harvested
// crop to stay deduped without growing the map unbounded.
const NOTIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type State = {
  farmId: number | null;
  subscriptions: StoredSubscription[];
  snapshot?: SnapshotEnvelope;
  // Last upstream `updatedAt` we ran the timer extractor against.
  // When the Coordinator/refresh path hands us the same value we can
  // short-circuit the expensive `makeGame` + `extractAndAggregate`
  // work — `FarmModel.updatedAt` only bumps when a real save lands
  // (see backend `addFarmDefaultValues` + `mongoDiff`), so equality
  // means nothing relevant changed.
  snapshotUpdatedAt?: string;
  // Keyed by `fireKey` (aggregationKey, or aggregationKey#item@readyAt
  // for multi-slot timers). Tracks scheduled push fires so we can diff
  // against the next snapshot and cancel obsolete ones.
  scheduled: Record<string, PendingFire>;
  // Idempotency: which fireKey/readyAt pair we've already pushed for.
  // Guards against at-least-once alarm retries within the OS's tag
  // dedup window. GC'd inline in fireTimer.
  notified: Record<string, number>;
  // Stable dedup for the ready digest (worker/readyDigest.ts). Keyed by a
  // state-based collectable's `aggregationKey` (salt node / beehive) →
  // the wall-clock time we last notified it was ready. An entry survives
  // only while the item stays ready; it's dropped once the item leaves
  // the ready set (collected / refilling), so the next fill re-notifies.
  // Distinct from `notified` (which is per-fire and embeds readyAt) — a
  // sitting-ready item must NOT get a fresh key every sweep.
  readyDigest?: Record<string, number>;
  // Last time this DO observed any activity. Optional because DOs
  // deployed before this field existed will hot-load without it;
  // `handleOnSnapshot` falls back to `snapshot.fetchedAt` and grants
  // a single TTL of grace.
  lastActivityAt?: number;
  // The `socialFarming.completedProjects` set we last observed. Village
  // projects have no `readyAt` — they complete when other players cheer,
  // at an unpredictable time — so completion is detected by diffing this
  // against each snapshot rather than scheduled against an alarm. A name
  // newly absent here fires a one-off "project complete" push. Optional /
  // `undefined` on a DO's first observation: that pass silently seeds the
  // set instead of firing, so enabling notifications on a farm with
  // already-completed projects doesn't blast a backlog of pushes (mirrors
  // the `seedAlreadyReady` crop-backlog guard).
  completedProjectsSeen?: string[];
};

// One Durable Object per farmId. Responsibilities:
//   * Hold push subscriptions (one row per device).
//   * Hold the latest farm snapshot (fed by the Coordinator's cron
//     sweep or by an on-demand refresh).
//   * Schedule per-timer alarms that fire web pushes at readyAt.
//   * Prune subscriptions returning 404/410 from the push service.
//   * Manage its own row in the D1 opted-in registry.
export class FarmPushDO extends Agent<Env, State> {
  initialState: State = {
    farmId: null,
    subscriptions: [],
    scheduled: {},
    notified: {},
    readyDigest: {},
  };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/subscribe":
        return this.handleSubscribe(request);
      case "/unsubscribe":
        return this.handleUnsubscribe(request);
      case "/categories":
        return this.handleCategories(request);
      case "/target":
        return this.handleNotificationTarget(request);
      case "/test":
        return this.handleTest(request);
      case "/refresh":
        return this.handleRefresh(request);
      case "/onSnapshot":
        return this.handleOnSnapshot(request);
      case "/state":
        return this.handleStateRequest(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // ─── HTTP handlers ────────────────────────────────────────────────

  private async handleSubscribe(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as
      | (SubscribeBody & { __accessSnapshot?: string })
      | null;
    if (
      !body?.subscription?.endpoint ||
      !body.subscription.keys?.p256dh ||
      !body.subscription.keys?.auth ||
      typeof body.farmId !== "number"
    ) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const prevSubs = this.state.subscriptions ?? [];
    const others = prevSubs.filter(
      (s) => s.endpoint !== body.subscription.endpoint,
    );

    // Cap distinct endpoints per farm. Re-subscribing the same
    // endpoint doesn't count (it's filtered into `others` above).
    if (others.length >= MAX_SUBSCRIPTIONS_PER_FARM) {
      return Response.json(
        {
          error: "Too many devices subscribed for this farm",
          max: MAX_SUBSCRIPTIONS_PER_FARM,
        },
        { status: 429 },
      );
    }

    // The worker entrypoint already fetched the farm payload as part of
    // its cohort gate (worker/access.ts). Apply that body here so the
    // freshness short-circuit below skips our own redundant `getFarm`
    // call — cuts BE load per first-time subscribe from 2 calls to 1
    // and is the primary fix for the "Upstream unavailable" 429s caused
    // by sharing one egress IP across all players. The DO is only
    // reachable via that entrypoint, so the snapshot is trusted; we
    // still verify `raw.id === body.farmId` to prevent a forwarded
    // payload for a different farm from polluting this DO's state.
    if (typeof body.__accessSnapshot === "string" && body.__accessSnapshot) {
      try {
        const raw = JSON.parse(body.__accessSnapshot) as {
          farm?: unknown;
          id?: number;
        };
        if (
          raw &&
          typeof raw === "object" &&
          raw.id === body.farmId &&
          raw.farm &&
          typeof raw.farm === "object"
        ) {
          await this.applySnapshot(raw as SnapshotEnvelope["raw"], {
            seedAlreadyReady: true,
          });
        }
      } catch {
        // Malformed — fall through to the upstream-fetch path below.
      }
    }

    // Prove the farm exists upstream before we persist anything. Skip
    // the upstream call when a recent snapshot already exists — its
    // presence is proof enough (second-device-on-same-farm path, or
    // the entrypoint-forwarded snapshot we just applied above).
    // Without this gate, any caller can permanently bloat D1 + DO
    // state + the periodic sweep by enrolling arbitrary farmIds.
    const snap = this.state.snapshot;
    const snapAgeMs = snap ? Date.now() - snap.fetchedAt : Infinity;
    const haveFreshSnapshot = snapAgeMs < WARM_FETCH_TTL_MS;

    if (!haveFreshSnapshot) {
      if (!this.env.SFL_COMMUNITY_API_KEY) {
        return Response.json(
          { error: "Server not configured" },
          { status: 503 },
        );
      }
      const key = await mintFarmKey(
        body.farmId,
        this.env.SFL_COMMUNITY_API_KEY,
      );
      // Forwarded from the worker entrypoint so the BE's per-IP
      // throttle scopes per-player instead of per-Worker-egress-IP.
      const clientIp = request.headers.get("x-client-ip") ?? undefined;
      const result = await getFarm(
        body.farmId,
        key,
        clientIp,
        this.env.SUPPORT_API_KEY,
      );
      if (!result.ok) {
        if (result.reason === "not_found") {
          return Response.json({ error: "Unknown farm" }, { status: 404 });
        }
        // upstream_error / network / parse — fail closed so callers
        // retry rather than us tentatively persisting and hoping the
        // sweep cleans up.
        return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
          status: 503,
          headers: {
            "content-type": "application/json",
            "retry-after": "30",
          },
        });
      }
      // Hot the snapshot now so the persist below sees an up-to-date
      // `state.snapshot` and so any client follow-up `/push/state`
      // doesn't hit a cold DO. Seed already-ready instances so a fresh
      // subscriber with a backlog of un-harvested crops doesn't get a
      // wall of "Item ready" pushes on enable.
      await this.applySnapshot(result.raw, { seedAlreadyReady: true });
    }

    const stored: StoredSubscription = {
      ...body.subscription,
      mutedCategories: body.mutedCategories,
      notificationTarget: body.notificationTarget,
    };
    this.setState({
      ...this.state,
      farmId: body.farmId,
      subscriptions: [...others, stored],
      scheduled: this.state.scheduled ?? {},
      notified: this.state.notified ?? {},
      lastActivityAt: Date.now(),
    });

    // Idempotent INSERT OR IGNORE — always run so the D1 registry
    // self-heals across deploys or schema changes. Failures are logged
    // and swallowed: the DO has already persisted the subscription, so
    // the user's "Enable" succeeds, but the coordinator sweep won't
    // find this farm in the registry until a later subscribe call
    // retries the insert. Loud logging surfaces persistent D1 outages
    // to monitoring rather than masking them as silent push gaps.
    await addOptIn(this.env, body.farmId).catch((err) => {
      console.error(
        `farmPushDO(${body.farmId}): addOptIn failed:`,
        err instanceof Error ? `${err.message}\n${err.stack}` : err,
      );
    });

    return Response.json({ ok: true }, { status: 201 });
  }

  private async handleUnsubscribe(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as {
      endpoint?: string;
    } | null;
    if (!body?.endpoint) {
      return Response.json({ error: "Missing endpoint" }, { status: 400 });
    }
    const remaining = this.state.subscriptions.filter(
      (s) => s.endpoint !== body.endpoint,
    );
    this.setState({ ...this.state, subscriptions: remaining });
    if (remaining.length === 0) await this.cleanup();
    return Response.json({ ok: true });
  }

  private async handleCategories(request: Request): Promise<Response> {
    const body = (await request
      .json()
      .catch(() => null)) as CategoriesBody | null;
    if (
      !body?.endpoint ||
      typeof body.farmId !== "number" ||
      !Array.isArray(body.mutedCategories)
    ) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    const subs = this.state.subscriptions ?? [];
    let matched = false;
    const next = subs.map((s) => {
      if (s.endpoint !== body.endpoint) return s;
      matched = true;
      return { ...s, mutedCategories: body.mutedCategories };
    });
    if (!matched) {
      // The subscription may have been pruned (404/410) before the
      // client got around to syncing its category set. Nothing to
      // patch — let the client re-subscribe to recreate it.
      return Response.json({ error: "Unknown endpoint" }, { status: 404 });
    }
    this.setState({ ...this.state, subscriptions: next });
    return Response.json({ ok: true });
  }

  // Per-device click target. Same endpoint-as-weak-ownership shape as
  // /categories — the caller has to know its own push endpoint.
  private async handleNotificationTarget(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as TargetBody | null;
    if (
      !body?.endpoint ||
      typeof body.farmId !== "number" ||
      (body.notificationTarget !== "overview" &&
        body.notificationTarget !== "play")
    ) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    const subs = this.state.subscriptions ?? [];
    let matched = false;
    const next = subs.map((s) => {
      if (s.endpoint !== body.endpoint) return s;
      matched = true;
      return { ...s, notificationTarget: body.notificationTarget };
    });
    if (!matched) {
      return Response.json({ error: "Unknown endpoint" }, { status: 404 });
    }
    this.setState({ ...this.state, subscriptions: next });
    return Response.json({ ok: true });
  }

  // Scoped to a single subscription so a test only buzzes the device
  // that asked for it. The endpoint also acts as a weak ownership
  // proof: a stranger who knows just the farmId can't fan out test
  // pushes to every device on that farm.
  private async handleTest(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as {
      endpoint?: string;
    } | null;
    if (!body?.endpoint) {
      return Response.json({ error: "Missing endpoint" }, { status: 400 });
    }
    const target = this.state.subscriptions.find(
      (s) => s.endpoint === body.endpoint,
    );
    if (!target) {
      return Response.json({ error: "Unknown endpoint" }, { status: 404 });
    }
    const payload: PushPayload = {
      title: this.env.APP_NAME,
      body: "Test notification — your device is set up for ready-timer pushes.",
      tag: "sfl-overview:test",
      url: clickUrl(target.notificationTarget, this.state.farmId),
    };
    return this.dispatchPush(payload, [target]);
  }

  // Scoped to a stored subscription. Without this, anyone who knows a
  // farmId could drive upstream fetches via the proxy — small cost per
  // call, but cheap to amplify by rotating ids across IPs. Same
  // ownership-proof shape as /test.
  private async handleRefresh(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as {
      endpoint?: string;
      snapshot?: string;
    } | null;
    if (!body?.endpoint) {
      return Response.json({ error: "Missing endpoint" }, { status: 400 });
    }
    if (this.state.farmId === null) {
      return Response.json({ error: "No farm" }, { status: 400 });
    }
    const known = this.state.subscriptions.some(
      (s) => s.endpoint === body.endpoint,
    );
    if (!known) {
      return Response.json({ error: "Unknown endpoint" }, { status: 404 });
    }
    // Prefer the SPA-forwarded snapshot when present: skips the
    // upstream fetch entirely (no per-IP throttle pressure) and
    // crucially avoids `refreshFromUpstream`'s 30s short-circuit,
    // which used to silently no-op cross-device refreshes and leave
    // /push/state serving stale snapshots to other devices.
    //
    // Three trust checks before applying:
    //   1. `raw.id === state.farmId` — a valid-endpoint caller can't
    //      poison this DO with another farm's payload.
    //   2. `raw.__proxyFetchedAt` (set server-side by handleProxyFarm
    //      in worker/index.ts) is strictly newer than our current
    //      snapshot's fetchedAt. Stops a malicious subscriber (or an
    //      out-of-order legitimate delivery from a second device)
    //      from rolling back DO state by replaying an old body, which
    //      would un-schedule alarms held by other subscribers.
    //   3. Falls through to refreshFromUpstream on any failure — the
    //      caller still gets a real refresh, just at the cost of an
    //      upstream fetch.
    if (typeof body.snapshot === "string" && body.snapshot.length > 0) {
      type RawShape = {
        farm?: unknown;
        id?: number;
        __proxyFetchedAt?: number;
      };
      let raw: RawShape | null;
      try {
        raw = JSON.parse(body.snapshot) as RawShape;
      } catch {
        raw = null;
      }
      const lastFetchedAt = this.state.snapshot?.fetchedAt ?? 0;
      if (
        raw &&
        typeof raw === "object" &&
        raw.id === this.state.farmId &&
        raw.farm &&
        typeof raw.farm === "object" &&
        typeof raw.__proxyFetchedAt === "number" &&
        raw.__proxyFetchedAt > lastFetchedAt
      ) {
        await this.applySnapshot(raw as SnapshotEnvelope["raw"]);
        this.touchActivity();
        return Response.json({
          ok: true,
          fetchedAt: this.state.snapshot?.fetchedAt,
        });
      }
      // Malformed / wrong farm / stale / unstamped — fall through to
      // the upstream-fetch path so the refresh still does something
      // useful (its own 30s gate then caps egress amplification).
    }
    const ok = await this.refreshFromUpstream();
    if (ok) this.touchActivity();
    return Response.json({ ok, fetchedAt: this.state.snapshot?.fetchedAt });
  }

  private async handleOnSnapshot(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as
      | SnapshotEnvelope["raw"]
      | null;
    if (!body || typeof body.id !== "number") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    // TTL vacuum. The coordinator hands every opted-in farm a fresh
    // snapshot on each sweep; if this DO has gone OPT_IN_TTL_MS
    // without observing any activity (subscribe, /push/state, /push/
    // refresh, or successful push delivery) we self-evict instead of
    // applying. Legacy DOs missing `lastActivityAt` fall back to the
    // snapshot's freshness, then to `now` — granting one TTL of grace
    // that gets persisted by touchActivity below.
    const last =
      this.state.lastActivityAt ?? this.state.snapshot?.fetchedAt ?? Date.now();
    if (Date.now() - last > OPT_IN_TTL_MS) {
      await this.cleanup();
      return Response.json({ vacuumed: true });
    }
    if (this.state.lastActivityAt === undefined) {
      // Persist the grace period observation so we don't keep
      // re-deriving the fallback from snapshot.fetchedAt every sweep.
      this.touchActivity();
    }
    await this.applySnapshot(body);
    return Response.json({ ok: true });
  }

  private async handleStateRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const since = Number(url.searchParams.get("since") ?? "0");
    const snap = this.state.snapshot;
    // A live PWA polling /push/state counts as activity regardless of
    // whether we hand back a new payload — `notModified` still proves
    // the client is around.
    this.touchActivity();
    if (!snap) return Response.json({ notModified: true });
    if (snap.fetchedAt <= since) {
      return Response.json({ notModified: true });
    }
    return Response.json({
      raw: snap.raw,
      fetchedAt: snap.fetchedAt,
    });
  }

  private touchActivity(): void {
    this.setState({ ...this.state, lastActivityAt: Date.now() });
  }

  // ─── Scheduled callback ───────────────────────────────────────────

  // Called by Agents' alarm dispatch when a per-timer schedule fires.
  // Method name passed to this.schedule() must match this name.
  async fireTimer(payload: FirePayload): Promise<void> {
    const { fireKey, readyAt, category } = payload;

    // Idempotency: drop if we've already pushed (or silently seeded)
    // for this fireKey. The fireKey now embeds readyAt, so presence
    // alone is sufficient — no need to compare values. Alarms
    // guarantee at-least-once; the OS `tag` is a second line of
    // defence client-side.
    if (fireKey in (this.state.notified ?? {})) return;

    // Per-device mute filter. Older PendingFires don't carry a
    // category (`undefined`), so they bypass the filter and fire to
    // every subscription — keeps in-flight schedules from disappearing
    // on deploy.
    const targets = category
      ? this.state.subscriptions.filter(
          (s) => !(s.mutedCategories ?? []).includes(category),
        )
      : this.state.subscriptions;

    if (targets.length > 0) {
      // Split by per-device click target. Each group gets its own URL
      // baked into the payload; dispatchPush handles 404/410 pruning
      // independently per call and the second call sees state updated
      // by the first.
      const overviewSubs: StoredSubscription[] = [];
      const playSubs: StoredSubscription[] = [];
      for (const s of targets) {
        if (s.notificationTarget === "play") playSubs.push(s);
        else overviewSubs.push(s);
      }
      const basePayload = {
        title: payload.title,
        body: payload.body,
        tag: fireKey,
        icon: payload.icon ?? "/icons/sfl_overview-192.webp",
        badge: "/icons/sfl_overview-badge-96.webp",
      };
      if (overviewSubs.length > 0) {
        await this.dispatchPush(
          { ...basePayload, url: clickUrl("overview", this.state.farmId) },
          overviewSubs,
        );
      }
      if (playSubs.length > 0) {
        await this.dispatchPush(
          { ...basePayload, url: clickUrl("play", this.state.farmId) },
          playSubs,
        );
      }
    }

    // Garbage-collect notified entries older than NOTIFIED_TTL_MS.
    // Value is the wall-clock time we recorded the entry (NOT the
    // fire's readyAt — readyAt can be ancient for seeded entries).
    const now = Date.now();
    const cutoff = now - NOTIFIED_TTL_MS;
    const nextNotified: Record<string, number> = {};
    for (const [k, recordedAt] of Object.entries(this.state.notified ?? {})) {
      if (recordedAt > cutoff) nextNotified[k] = recordedAt;
    }
    nextNotified[fireKey] = now;
    void readyAt;

    // Drop the spent entry from `scheduled` — its alarm has fired.
    const { [fireKey]: _spent, ...rest } = this.state.scheduled ?? {};
    void _spent;
    this.setState({
      ...this.state,
      scheduled: rest,
      notified: nextNotified,
    });
  }

  // ─── Internals ────────────────────────────────────────────────────

  // Mint a key + fetch this farm + apply. Used at subscribe-time and
  // by /refresh. Returns true on success.
  //
  // Short-circuits when the existing snapshot is fresher than
  // REFRESH_TTL_MS, returning true without an upstream call. Caller
  // already has effectively the data it would get back.
  private async refreshFromUpstream(): Promise<boolean> {
    if (this.state.farmId === null || !this.env.SFL_COMMUNITY_API_KEY) {
      return false;
    }
    const snap = this.state.snapshot;
    if (snap && Date.now() - snap.fetchedAt < REFRESH_TTL_MS) {
      return true;
    }
    const key = await mintFarmKey(
      this.state.farmId,
      this.env.SFL_COMMUNITY_API_KEY,
    );
    const result = await getFarm(
      this.state.farmId,
      key,
      undefined,
      this.env.SUPPORT_API_KEY,
    );
    if (!result.ok) return false;
    await this.applySnapshot(result.raw);
    return true;
  }

  // Hydrate the raw payload, run the timer extractor, and diff against
  // existing schedules. Cancels obsolete fires, adds new ones, leaves
  // unchanged ones alone.
  //
  // `seedAlreadyReady`: when true, any instance with readyAt <= now is
  // silently recorded in `notified` instead of firing immediately.
  // Only the subscribe path passes this — it prevents enabling
  // notifications on a farm with a backlog of un-harvested ready
  // crops from producing a wall of "Item ready" pushes. All other
  // callers (refresh / coordinator sweep) pass false so genuinely-
  // newly-observed ready items still fire (Bug 1 fix).
  private async applySnapshot(
    raw: SnapshotEnvelope["raw"],
    opts?: { seedAlreadyReady?: boolean },
  ): Promise<void> {
    const seedAlreadyReady = opts?.seedAlreadyReady ?? false;
    const now = Date.now();
    const farmId = raw.id;

    // Cheap escape hatch: when `updatedAt` matches what we last saw,
    // nothing meaningful changed upstream, so the timer extractor +
    // schedule diff would produce identical results. Skip the heavy
    // work and just bump `fetchedAt` so `/push/state` still serves
    // the snapshot to callers who haven't seen this version yet.
    //
    // Skip the short-circuit on the subscribe path so seeding always
    // gets a chance to populate `notified` for currently-ready items.
    const upstreamUpdatedAt = raw.updatedAt;
    if (
      !seedAlreadyReady &&
      upstreamUpdatedAt !== undefined &&
      upstreamUpdatedAt === this.state.snapshotUpdatedAt
    ) {
      this.setState({
        ...this.state,
        farmId,
        snapshot: { raw, fetchedAt: now },
      });
      return;
    }

    const hydrated = makeGame(raw.farm as Parameters<typeof makeGame>[0]);
    const aggregated = extractAndAggregate(hydrated, farmId, now);

    // Village-project completions. Unlike timers these have no readyAt —
    // they complete when other players cheer — so we diff the snapshot's
    // `completedProjects` against what we last saw. `undefined` means this
    // is our first observation of the farm (brand-new DO, or a DO from
    // before this field existed): seed silently so we don't blast a push
    // for every already-completed project. We always re-record the
    // current set below, even on the seed pass.
    const currentCompleted = (
      hydrated.socialFarming?.completedProjects ?? []
    ).map(String);
    const seenProjects = this.state.completedProjectsSeen;
    const completedNotifs =
      seenProjects === undefined
        ? []
        : detectCompletedProjects(hydrated, seenProjects);

    // Build the fresh fire-key map.
    type FreshFire = Omit<PendingFire, "scheduleId">;
    const fresh = new Map<string, FreshFire>();
    const notified = { ...(this.state.notified ?? {}) };
    let seededCount = 0;

    // State-based collectables (salt nodes, beehives) opt into the ready
    // digest instead of the per-instance alarm path — collected here and
    // planned below. Gathered before the `idle` skip so a paused hive
    // (idle, not full) still clears any stale "was full" dedup entry.
    const digestMembers: DigestMember[] = [];

    for (const t of aggregated) {
      if (t.notifyDigest) {
        digestMembers.push({
          key: t.aggregationKey ?? t.id,
          group: t.notifyDigest.group,
          noun: t.notifyDigest.noun,
          ready: t.notifyDigest.ready,
          icon: t.icon,
          category: t.category,
          amount: t.predictedYield?.amount ?? 0,
          item: t.predictedYield?.item,
        });
        continue;
      }
      if (t.idle) continue;
      // Informational countdown cards (e.g. the Love Island live window)
      // render on the dashboard but opt out of push — the "{label}
      // ready" framing doesn't fit a window-close deadline.
      if (t.notify === false) continue;
      for (const inst of instancesFor(t)) {
        // Dedup: a previous fire (or seed) already covered this exact
        // ripening event. The new fireKey embeds readyAt so a presence
        // check is sufficient — no need to compare values.
        if (inst.fireKey in notified) continue;

        if (inst.readyAt <= now) {
          if (seedAlreadyReady) {
            // Silent seed — record without scheduling. Next fire/sweep
            // observing the same fireKey will dedup against this.
            notified[inst.fireKey] = now;
            seededCount += 1;
            continue;
          }
          // Bug 1 fix: don't drop already-ready instances. Schedule
          // with delay=1 so the OS fires the push on the next alarm
          // tick. The `notified` dedup above guards re-fires across
          // future sweeps.
        }
        fresh.set(inst.fireKey, inst);
      }
    }

    // Storage cap: keep the earliest readyAts if the player has more
    // than the DO can comfortably store. Realistic farms stay well
    // under this. Logging the overflow surfaces whales for future
    // tuning rather than failing silently.
    if (fresh.size > MAX_SCHEDULED_PER_DO) {
      const sorted = [...fresh.entries()].sort(
        (a, b) => a[1].readyAt - b[1].readyAt,
      );
      const kept = new Map(sorted.slice(0, MAX_SCHEDULED_PER_DO));
      console.warn(
        `farmPushDO(${farmId}): scheduled cap hit (${fresh.size} > ${MAX_SCHEDULED_PER_DO}); dropping ${fresh.size - MAX_SCHEDULED_PER_DO} latest`,
      );
      fresh.clear();
      for (const [k, v] of kept) fresh.set(k, v);
    }

    // Diff against existing schedule. `?? {}` covers DOs that
    // existed before this field was added to State.
    const old = this.state.scheduled ?? {};
    const nextScheduled: Record<string, PendingFire> = {};

    for (const [k, fire] of Object.entries(old)) {
      const next = fresh.get(k);
      // Re-schedule when any payload field differs, not just readyAt.
      // The alarm callback receives a frozen copy of `f` at schedule
      // time, so if our formatter or icon-URL logic changes between
      // versions, existing alarms keep firing with the old payload
      // unless we explicitly recreate them. `count` is included so a
      // cluster gaining/losing members reschedules with the right
      // headline even when readyAt happens to match.
      const unchanged =
        next !== undefined &&
        next.readyAt === fire.readyAt &&
        next.title === fire.title &&
        next.body === fire.body &&
        next.icon === fire.icon &&
        next.category === fire.category &&
        next.count === fire.count;
      if (!unchanged) {
        await this.cancelSchedule(fire.scheduleId).catch(() => {});
        // Don't carry over.
      } else {
        // Payload unchanged → keep the existing schedule.
        nextScheduled[k] = fire;
        fresh.delete(k);
      }
    }

    // Anything left in `fresh` is either new or rescheduled.
    for (const [k, f] of fresh) {
      const delaySec = Math.max(1, Math.ceil((f.readyAt - now) / 1000));
      try {
        const sched = await this.schedule(delaySec, "fireTimer", f);
        nextScheduled[k] = { ...f, scheduleId: sched.id };
      } catch {
        // Schedule failure (e.g. transient storage error). Skip this
        // fire; next snapshot will retry.
      }
    }

    // Fire a one-off push for each newly-completed village project.
    // `delay=1` rides the same `fireTimer` path as scheduled timers
    // (per-device targeting / mute / endpoint pruning). These don't go in
    // `scheduled` — they're transient and self-clear after firing — so
    // they never count against MAX_SCHEDULED_PER_DO. The fireKey embeds
    // `updatedAt` so a restart-then-recomplete fires again rather than
    // being deduped by `notified`.
    for (const n of completedNotifs) {
      try {
        await this.schedule(1, "fireTimer", {
          fireKey: `vp:${n.name}@${upstreamUpdatedAt ?? now}`,
          readyAt: now,
          title: n.title,
          body: n.body,
          category: "Village Projects",
          count: 1,
        } satisfies FirePayload);
      } catch {
        // Schedule failure (e.g. transient storage error). The next sweep
        // re-detects it (still unseen) and retries.
      }
    }

    // Plan the ready digest for state-based collectables. On the subscribe
    // path (`seedAlreadyReady`) we only seed the dedup set so a backlog of
    // full hives / maxed nodes doesn't blast a wall of pushes. Otherwise
    // we fire ONE grouped push per group for members that became ready
    // since the last snapshot. `nextSeen` carries forward only still-ready
    // members, so a sitting-ready item is deduped until it's collected.
    const { fires: digestFires, nextSeen } = planReadyDigest(
      digestMembers,
      this.state.readyDigest ?? {},
      now,
      { seedOnly: seedAlreadyReady },
    );
    for (const f of digestFires) {
      try {
        // Ride the same one-off `fireTimer` path as village projects
        // (per-device targeting / mute / endpoint pruning). These aren't
        // tracked in `scheduled` — they're transient and self-clear after
        // firing — so they never count against MAX_SCHEDULED_PER_DO.
        await this.schedule(1, "fireTimer", {
          fireKey: f.fireKey,
          readyAt: now,
          title: f.title,
          body: f.body,
          icon: f.icon,
          category: f.category,
          count: f.count,
        } satisfies FirePayload);
      } catch {
        // Schedule failure (e.g. transient storage error). The next sweep
        // re-detects the still-ready members and retries.
      }
    }

    this.setState({
      ...this.state,
      farmId,
      snapshot: { raw, fetchedAt: now },
      snapshotUpdatedAt: upstreamUpdatedAt,
      scheduled: nextScheduled,
      notified: seededCount > 0 ? notified : this.state.notified,
      readyDigest: nextSeen,
      completedProjectsSeen: currentCompleted,
    });
  }

  // Send a push to the given subscription set (defaults to every
  // stored subscription) and prune dead endpoints. Callers narrow the
  // target list for per-category filtering; pruning still operates on
  // the full state.subscriptions so a 410 from a muted endpoint is
  // never observed and the DO can't react — that's fine, the next
  // unmuted fire will prune it.
  private async dispatchPush(
    payload: PushPayload,
    targets: StoredSubscription[] = this.state.subscriptions,
  ): Promise<Response> {
    const results = await sendAll(this.env, targets, payload);
    const sent = results.filter((r) => r.ok).length;
    const dead = new Set(
      results
        .filter((r): r is Extract<typeof r, { gone: true }> => !r.ok && r.gone)
        .map((r) => r.endpoint),
    );
    if (dead.size > 0) {
      const remaining = this.state.subscriptions.filter(
        (s) => !dead.has(s.endpoint),
      );
      this.setState({ ...this.state, subscriptions: remaining });
      if (remaining.length === 0) await this.cleanup();
    }
    // Successful delivery proves a real device is on the other end —
    // refresh the TTL. Pruning-only fan-outs (every result was 404/
    // 410) don't count: that's evidence of churn, not activity.
    if (sent > 0) this.touchActivity();
    return Response.json({
      sent,
      pruned: dead.size,
      total: results.length,
    });
  }

  // Stop scheduling and remove ourselves from the registry. Called
  // when the last subscription is removed, 404/410-pruned away, or
  // TTL-vacuumed from handleOnSnapshot.
  //
  // Resets `snapshotUpdatedAt` so a future resubscribe — which re-runs
  // applySnapshot — doesn't trip the "same updatedAt, skip reschedule"
  // short-circuit and leave the DO with zero fires for ready timers.
  //
  // Resets `completedProjectsSeen` to undefined for the same reason: a
  // resubscribe must re-seed it silently, otherwise any project that
  // completed while unsubscribed would fire as a backlog push.
  private async cleanup(): Promise<void> {
    for (const fire of Object.values(this.state.scheduled ?? {})) {
      await this.cancelSchedule(fire.scheduleId).catch(() => {});
    }
    this.setState({
      ...this.state,
      subscriptions: [],
      scheduled: {},
      snapshotUpdatedAt: undefined,
      readyDigest: {},
      completedProjectsSeen: undefined,
    });
    if (this.state.farmId !== null) {
      // DO state is already clear; a D1 failure here leaves a phantom
      // registry row that wastes coordinator effort on a sub-less DO
      // until the 30-day TTL vacuum catches it. Log so monitoring sees
      // persistent failures instead of letting them rot quietly.
      const farmId = this.state.farmId;
      await removeOptIn(this.env, farmId).catch((err) => {
        console.error(
          `farmPushDO(${farmId}): removeOptIn failed:`,
          err instanceof Error ? `${err.message}\n${err.stack}` : err,
        );
      });
    }
  }
}
