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
  // Master HMAC secret used to mint per-farm community API keys
  // (sfl.{base64url(farmId)}.{hmac(secret, farmId)}) and as x-api-key
  // for the paginated /community/farms scan.
  SFL_COMMUNITY_API_KEY: string;
  // VAPID keypair for Web Push. PUBLIC is also surfaced to the PWA via
  // GET /push/vapid (avoids baking it into the SPA bundle at build).
  VAPID_PUBLIC: string;
  VAPID_PRIVATE: string;
  // mailto: address used as the JWT subject in VAPID-signed pushes.
  // Plain var (not a secret) — see wrangler.jsonc.
  VAPID_SUBJECT: string;
}

// PushSubscriptionJSON shape (browser PushSubscription.toJSON()).
// Repeated here because @cloudflare/workers-types doesn't ship the
// browser's `PushSubscriptionJSON` interface.
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
};

// Wire shape for /push/subscribe request bodies.
export type SubscribeBody = {
  farmId: number;
  subscription: Omit<StoredSubscription, "mutedCategories">;
  mutedCategories?: string[];
};

// Wire shape for /push/categories — updates the mute list on an
// existing subscription without re-running the full subscribe flow.
export type CategoriesBody = {
  farmId: number;
  endpoint: string;
  mutedCategories: string[];
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
  scheduleId: string;
};

// Payload passed from this.schedule() to the fireTimer callback. Same
// fields as PendingFire minus scheduleId (the callback doesn't need
// its own id).
export type FirePayload = Omit<PendingFire, "scheduleId">;

// Raw farm response from upstream, plus when we observed it. Shape
// mirrors `src/api/fetchFarm.ts:FarmResponse` so the snapshot can flow
// straight into the SPA's localStorage cache without massaging.
export type SnapshotEnvelope = {
  raw: {
    farm: unknown;
    id: number;
    nft_id?: number;
    nftId?: number;
    isBlacklisted?: boolean;
  };
  fetchedAt: number;
};
