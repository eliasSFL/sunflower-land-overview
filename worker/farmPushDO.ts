/// <reference types="@cloudflare/workers-types" />

import { Agent } from "agents";
import { sendAll } from "./push.ts";
import { getFarm, mintFarmKey } from "./communityApi.ts";
import { addOptIn, removeOptIn } from "./registry.ts";
import { makeGame } from "../src/game/index.ts";
import { extractAndAggregate } from "../src/timers/index.ts";
import type {
  Env,
  StoredSubscription,
  SubscribeBody,
  CategoriesBody,
  PushPayload,
  PendingFire,
  FirePayload,
  SnapshotEnvelope,
} from "./types.ts";

// Round yield amounts to 2 decimal places, strip trailing zeros so
// notification bodies don't show JS float garbage like "4.8000000002".
function formatAmount(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

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
      case "/test":
        return this.handleTest(request);
      case "/refresh":
        return this.handleRefresh();
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
    const body = (await request
      .json()
      .catch(() => null)) as SubscribeBody | null;
    if (
      !body?.subscription?.endpoint ||
      !body.subscription.keys?.p256dh ||
      !body.subscription.keys?.auth ||
      typeof body.farmId !== "number"
    ) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const prevSubs = this.state.subscriptions ?? [];
    const wasEmpty = prevSubs.length === 0;
    const others = prevSubs.filter(
      (s) => s.endpoint !== body.subscription.endpoint,
    );
    const stored: StoredSubscription = {
      ...body.subscription,
      mutedCategories: body.mutedCategories,
    };
    this.setState({
      ...this.state,
      farmId: body.farmId,
      subscriptions: [...others, stored],
      scheduled: this.state.scheduled ?? {},
      notified: this.state.notified ?? {},
    });

    // Idempotent INSERT OR IGNORE — always run so the D1 registry
    // self-heals across deploys or schema changes.
    await addOptIn(this.env, body.farmId).catch(() => {});
    if (wasEmpty) {
      // The warm fetch is best-effort — failure just means the player
      // waits until the next coordinator sweep (≤10 min) for their
      // first push schedule.
      await this.refreshFromUpstream().catch(() => {});
    }

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
      title: "Sunflower Land Overview",
      body: "Test notification — your device is set up for ready-timer pushes.",
      tag: "sfl-overview:test",
      url: "/",
    };
    return this.dispatchPush(payload, [target]);
  }

  private async handleRefresh(): Promise<Response> {
    if (this.state.farmId === null) {
      return Response.json({ error: "No farm" }, { status: 400 });
    }
    const ok = await this.refreshFromUpstream();
    return Response.json({ ok, fetchedAt: this.state.snapshot?.fetchedAt });
  }

  private async handleOnSnapshot(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as
      | SnapshotEnvelope["raw"]
      | null;
    if (!body || typeof body.id !== "number") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    await this.applySnapshot(body);
    return Response.json({ ok: true });
  }

  private async handleStateRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const since = Number(url.searchParams.get("since") ?? "0");
    const snap = this.state.snapshot;
    if (!snap) return Response.json({ notModified: true });
    if (snap.fetchedAt <= since) {
      return Response.json({ notModified: true });
    }
    return Response.json({
      raw: snap.raw,
      fetchedAt: snap.fetchedAt,
    });
  }

  // ─── Scheduled callback ───────────────────────────────────────────

  // Called by Agents' alarm dispatch when a per-timer schedule fires.
  // Method name passed to this.schedule() must match this name.
  async fireTimer(payload: FirePayload): Promise<void> {
    const { fireKey, readyAt, category } = payload;

    // Idempotency: drop if we've already pushed for this exact
    // (fireKey, readyAt). Alarms guarantee at-least-once; the OS `tag`
    // is a second line of defence client-side.
    if (this.state.notified[fireKey] === readyAt) return;

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
      const pushPayload: PushPayload = {
        title: payload.title,
        body: payload.body,
        tag: fireKey,
        icon: payload.icon ?? "/icons/sfl_overview-192.webp",
        badge: "/icons/sfl_overview-badge-96.webp",
        url: `/?farmId=${this.state.farmId ?? ""}`,
      };
      await this.dispatchPush(pushPayload, targets);
    }

    // Garbage-collect notified entries older than 24h.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const nextNotified: Record<string, number> = {};
    for (const [k, at] of Object.entries(this.state.notified ?? {})) {
      if (at > cutoff) nextNotified[k] = at;
    }
    nextNotified[fireKey] = readyAt;

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
  private async refreshFromUpstream(): Promise<boolean> {
    if (this.state.farmId === null || !this.env.SFL_COMMUNITY_API_KEY) {
      return false;
    }
    const key = await mintFarmKey(
      this.state.farmId,
      this.env.SFL_COMMUNITY_API_KEY,
    );
    const raw = await getFarm(this.state.farmId, key);
    if (!raw) return false;
    await this.applySnapshot(raw);
    return true;
  }

  // Hydrate the raw payload, run the timer extractor, and diff against
  // existing schedules. Cancels obsolete fires, adds new ones, leaves
  // unchanged ones alone.
  private async applySnapshot(raw: SnapshotEnvelope["raw"]): Promise<void> {
    const now = Date.now();
    const farmId = raw.id;

    // Cheap escape hatch: when `updatedAt` matches what we last saw,
    // nothing meaningful changed upstream, so the timer extractor +
    // schedule diff would produce identical results. Skip the heavy
    // work and just bump `fetchedAt` so `/push/state` still serves
    // the snapshot to callers who haven't seen this version yet.
    const upstreamUpdatedAt = (raw as { updatedAt?: string }).updatedAt;
    if (
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

    // Build the fresh fire-key map.
    type FreshFire = Omit<PendingFire, "scheduleId">;
    const fresh = new Map<string, FreshFire>();
    for (const t of aggregated) {
      if (t.idle) continue;
      const aggKey = t.aggregationKey ?? t.id;
      const countPrefix = t.count > 1 ? `${t.count}× ` : "";
      if (t.slots && t.slots.length > 0) {
        // Multi-slot building (cooking, crafting, aging). One fire per
        // slot, tagged with slot item + readyAt so OS dedup is precise.
        for (const s of t.slots) {
          if (s.readyAt <= now) continue;
          const fireKey = `${aggKey}#${s.item}@${s.readyAt}`;
          fresh.set(fireKey, {
            fireKey,
            readyAt: s.readyAt,
            title: `${s.item} ready`,
            body: `${t.label} · ${t.category}`,
            icon: s.icon ?? t.icon,
            category: t.category,
          });
        }
      } else {
        if (t.readyAt <= now) continue;
        const label = t.label;
        const headline = t.predictedYield
          ? `${countPrefix}${formatAmount(t.predictedYield.amount)} ${t.predictedYield.item}`
          : `${countPrefix}${label}`;
        fresh.set(aggKey, {
          fireKey: aggKey,
          readyAt: t.readyAt,
          title: `${label} ready`,
          body: `${headline} · ${t.category}`,
          icon: t.icon,
          category: t.category,
        });
      }
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
      // unless we explicitly recreate them.
      const unchanged =
        next !== undefined &&
        next.readyAt === fire.readyAt &&
        next.title === fire.title &&
        next.body === fire.body &&
        next.icon === fire.icon &&
        next.category === fire.category;
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

    this.setState({
      ...this.state,
      farmId,
      snapshot: { raw, fetchedAt: now },
      snapshotUpdatedAt: upstreamUpdatedAt,
      scheduled: nextScheduled,
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
    return Response.json({
      sent: results.filter((r) => r.ok).length,
      pruned: dead.size,
      total: results.length,
    });
  }

  // Stop scheduling and remove ourselves from the registry. Called
  // when the last subscription is removed or 404/410-pruned away.
  private async cleanup(): Promise<void> {
    for (const fire of Object.values(this.state.scheduled ?? {})) {
      await this.cancelSchedule(fire.scheduleId).catch(() => {});
    }
    this.setState({
      ...this.state,
      scheduled: {},
    });
    if (this.state.farmId !== null) {
      await removeOptIn(this.env, this.state.farmId).catch(() => {});
    }
  }
}
