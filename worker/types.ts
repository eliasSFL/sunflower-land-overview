/// <reference types="@cloudflare/workers-types" />

// Shared bindings + JSON types used across the Worker entrypoint, the
// FarmPushDO, and the future Coordinator. Single source of truth so
// adding a new env var only touches this file.

export interface Env {
  ASSETS: Fetcher;
  // D1 registry of opted-in farm IDs. Binding name matches what wrangler
  // d1 create produced — kept lowercase intentionally.
  sfl_overview_push: D1Database;
  // One DO instance per farmId. See worker/farmPushDO.ts.
  FARM_PUSH_DO: DurableObjectNamespace;
  // Base URL of the Sunflower Land API the Worker proxies to. Mirrors
  // the game client's `VITE_API_URL`. Unset ⇒ production
  // (`https://api.sunflower-land.com`, see `DEFAULT_UPSTREAM` /
  // `upstreamBase` in worker/communityApi.ts). Point it at a personal
  // SST stage (e.g. the raw API Gateway URL of `api-<stage>`) to run
  // the overview against that stage. Set locally via `.dev.vars`; the
  // matching stage's `COMMUNITY_API_KEY_SECRET` must sign
  // `SFL_COMMUNITY_API_KEY` below or upstream returns 401/404.
  SFL_API_URL?: string;
  // Master HMAC secret used to mint per-farm community API keys
  // (sfl.{base64url(farmId)}.{hmac(secret, farmId)}) and as x-api-key
  // for the paginated /community/farms scan.
  SFL_COMMUNITY_API_KEY: string;
  // Opaque admin secret shared with the upstream BE. Sent on the
  // `x-support-key` header alongside the per-farm key; when it matches
  // the BE's `process.env.SUPPORT_API_KEY` the BE trusts our forwarded
  // `x-forwarded-client-ip` for the `community-get-farm` throttle key
  // (scoping the bucket per-player instead of per-Worker-egress-IP).
  // Optional so dev deploys without it still work — the BE falls back
  // to `cf-connecting-ip` when the header is absent.
  SUPPORT_API_KEY?: string;
  // VAPID keypair for Web Push. PUBLIC is also surfaced to the PWA via
  // GET /push/vapid (avoids baking it into the SPA bundle at build).
  VAPID_PUBLIC: string;
  VAPID_PRIVATE: string;
  // mailto: address used as the JWT subject in VAPID-signed pushes.
  // Plain var (not a secret) — see wrangler.jsonc.
  VAPID_SUBJECT: string;
  // Display name used as the push notification `title`. Set per
  // environment in wrangler.jsonc so dev pushes read "(DEV) Sunflower Land
  // Overview" — keeps an installed dev PWA distinguishable from
  // the prod one on the lockscreen.
  APP_NAME: string;
  // Shared secret gating admin-only endpoints (currently just
  // POST /push/sweep). Sent by the caller in the `x-admin-secret`
  // header; absence on the env fails the check closed.
  ADMIN_SECRET: string;
  // Per-IP-per-path rate limiter applied at the top of fetch() to
  // every /push/* and /api/* request. Configured in wrangler.jsonc
  // under `ratelimits`: 60 requests per 60s, namespace_id "1001".
  PUSH_RATE_LIMITER: RateLimit;
}

// PushSubscriptionJSON shape (browser PushSubscription.toJSON()).
// Repeated here because @cloudflare/workers-types doesn't ship the
// browser's `PushSubscriptionJSON` interface.
// Where a tapped notification should land. "overview" (default) keeps
// the user in this PWA; "play" jumps to sunflower-land.com/play. Per
// device — phone and desktop can disagree.
export type NotificationTarget = "overview" | "play";

export type StoredSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  // Categories the player has explicitly silenced on this device.
  // Absent ≡ no mutes, so newly added timer categories (upstream
  // expansions) default to "notify" instead of getting auto-silenced.
  // Strings rather than the typed `Category` union so a stale stored
  // record from an older app version doesn't break parsing.
  mutedCategories?: string[];
  // Where the notification click should open. Absent ≡ "overview"
  // (legacy subs default to the existing behavior).
  notificationTarget?: NotificationTarget;
};

// Wire shape for /push/subscribe request bodies.
export type SubscribeBody = {
  farmId: number;
  subscription: Omit<
    StoredSubscription,
    "mutedCategories" | "notificationTarget"
  >;
  mutedCategories?: string[];
  notificationTarget?: NotificationTarget;
};

// Wire shape for /push/categories — updates the mute list on an
// existing subscription without re-running the full subscribe flow.
export type CategoriesBody = {
  farmId: number;
  endpoint: string;
  mutedCategories: string[];
};

// Wire shape for /push/target — updates the notification click
// destination on an existing subscription. Same shape as
// CategoriesBody; separate endpoint keeps the prefs orthogonal.
export type TargetBody = {
  farmId: number;
  endpoint: string;
  notificationTarget: NotificationTarget;
};

// Wire shape for the JSON payload pushed to the SW. Mirrors what the
// service worker's `push` event handler reads off `event.data.json()`.
export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
};

// One scheduled push event tracked inside the DO. `fireKey` uniquely
// identifies an aggregation (or a slot of one) and doubles as the OS
// `tag` so re-fires replace in place.
export type PendingFire = {
  fireKey: string;
  readyAt: number;
  title: string;
  body: string;
  icon?: string;
  // Source category (e.g. "Crops", "Beehives"). Used at fire time to
  // skip subscriptions whose `mutedCategories` includes this value.
  // Optional so PendingFire records persisted before this field was
  // introduced still load — those simply fire to everyone.
  category?: string;
  // Cluster size for aggregated multi-instance fires (e.g. 5 zucchini
  // ripening within one window → count=5). Optional — single-instance
  // fires omit it. Tracked here so the `unchanged` diff check in
  // applySnapshot reschedules when a cluster's membership changes
  // even if its `readyAt` doesn't move.
  count?: number;
  scheduleId: string;
};

// Payload passed from this.schedule() to the fireTimer callback. Same
// fields as PendingFire minus scheduleId (the callback doesn't need
// its own id).
export type FirePayload = Omit<PendingFire, "scheduleId">;

// Raw farm response from upstream, plus when we observed it. Shape
// mirrors `src/api/fetchFarm.ts:FarmResponse` so the snapshot can flow
// straight into the SPA's localStorage cache without massaging.
// `updatedAt` is present on coordinator-fed snapshots (lifted out of
// the batch endpoint's farm payload by worker/coordinator.ts) and lets
// applySnapshot short-circuit the reschedule diff when nothing changed
// upstream. Absent on single-farm GETs.
export type SnapshotEnvelope = {
  raw: {
    farm: unknown;
    id: number;
    nft_id?: number;
    nftId?: number;
    isBlacklisted?: boolean;
    updatedAt?: string;
  };
  fetchedAt: number;
};
