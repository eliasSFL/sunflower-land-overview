# Sunflower Land Overview — End-to-end guide

A walkthrough of how the app works, from the player typing a Farm ID into
the form all the way through to a push notification firing on their phone
while the PWA is closed. Written for newcomers — if a term shows up that
you don't recognise, it's defined the first time it appears.

The repo's [README](../README.md) is the install / contribute guide. This
document is the "how the moving parts fit together" guide. They don't
overlap — you can read either one without the other.

## TL;DR — the shape of the system

The app has **three** runtime pieces and one **build-time** dependency:

```
                                        ┌──────────────────────────┐
                                        │  Sunflower Land BE       │
                                        │  api.sunflower-land.com  │
                                        │  (the official game API) │
                                        └──────────────────────────┘
                                                  ▲
                                                  │ HMAC-signed
                                                  │ community key
                                                  │
   ┌──────────────────────┐    /api/farms/{id}    │   ┌──────────────────────────┐
   │  Browser SPA         │ ─────────────────────▶│   │  Cloudflare Worker       │
   │  (React + Vite)      │ ◀──── JSON farm ──────┘   │  worker/index.ts         │
   │                      │                           │                          │
   │  service worker      │                           │  ┌────────────────────┐  │
   │  src/sw.ts           │ ◀── Web Push ──────────── │  │ FarmPushDO (1/farm)│  │
   │                      │                           │  │ subs + schedule    │  │
   └──────────────────────┘                           │  │ (Durable Object)   │  │
                                                      │  └────────────────────┘  │
                                                      │  ┌────────────────────┐  │
                                                      │  │ Coordinator        │  │
                                                      │  │ cron */10 min      │  │
                                                      │  └────────────────────┘  │
                                                      │  D1 table: opted_in    │
                                                      └──────────────────────────┘

                                        ╔══════════════════════════╗
                                        ║  sunflower-land/         ║
                                        ║  (git submodule, daily   ║
                                        ║   GH Action bumps it)    ║
                                        ║  yields + recipes math   ║
                                        ╚══════════════════════════╝
                                        ↑ imported by SPA AND Worker
```

1. **SPA** — A Vite + React + TypeScript single-page app. The player types
   a Farm ID, the SPA fetches that farm's game state, computes timers,
   and renders the dashboard. Lives in [src/](../src/).
2. **Cloudflare Worker** — The same code is responsible for: proxying
   farm fetches (so the API key never reaches the browser), holding push
   subscriptions, running a 10-minute cron sweep, and delivering web
   pushes. Lives in [worker/](../worker/).
3. **Service Worker** — A worker registered by the SPA in the browser. It
   handles `push` events when the browser delivers a notification and
   handles `notificationclick` when the player taps it. Lives at
   [src/sw.ts](../src/sw.ts). Note: a Cloudflare Worker is one thing; a
   browser Service Worker is a different thing. Both are called "workers."
4. **`sunflower-land/` submodule** — The game's source tree, pinned as a
   git submodule. The overview imports yield / recipe / timer functions
   directly from it so the math always matches what the game would
   compute. A daily GitHub Action fast-forwards the submodule pointer.

The rest of this document walks each piece in order.

---

## Part 1 — The SPA boot sequence

### Entry point

[src/main.tsx](../src/main.tsx) mounts a single `<App />` into `#root`.
[index.html](../index.html) is the only HTML page — every route ultimately
serves this file (the SPA does its own routing client-side).

### How `App` is structured

[src/app/App.tsx](../src/app/App.tsx) is a thin orchestrator (~115 lines).
Its only jobs are: derive memos (`timers`, `byCategory`, `visibleCategories`,
`cooldownLeft`), and compose four building blocks:

| File                                                          | Role                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/hooks/useFarmData.ts](../src/hooks/useFarmData.ts)       | Farm load state, cache hydration, DO snapshot pull, the `load(id)` function with its in-flight guard and 60s refresh cooldown. Returns `{ farmId, data, loading, error, accessDenied, lastFetchedAt, load }`.                    |
| [src/hooks/useNavSections.ts](../src/hooks/useNavSections.ts) | Builds the MobileNav chip list from the dashboard's render order — Bumpkin / Ready (conditional) / Next up / Idle (conditional) / per-token Deliveries / each visible category.                                                  |
| [src/app/DashboardHeader.tsx](../src/app/DashboardHeader.tsx) | The banner JSX — title, version SHA link, "Refreshed Xs ago", "Saved Xs ago", donation chip, stale-build prompt. Owns `useVersionCheck` internally.                                                                              |
| [src/app/DashboardGrid.tsx](../src/app/DashboardGrid.tsx)     | The multi-column flow containing every panel. Renders [FarmIdPanel](../src/app/FarmIdPanel.tsx) when there's no farm yet, otherwise BumpkinSummary → Ready → NextUp → Idle → Deliveries → one TimerSection per visible category. |

### What `App` does on mount

Walking through the orchestrator top to bottom:

1. **`useFarmData()` runs first.** Inside the hook:
   - Read Farm ID from `localStorage` (key `sfl-overview:farm-id`). If
     present, the player is returning — we can render their dashboard
     immediately without waiting for the network.
   - Read the cached farm payload (key `sfl-overview:farm:{id}`). The
     cache is the raw JSON the BE returned last time, plus an `at`
     timestamp. [loadCachedFarm](../src/api/fetchFarm.ts) does this
     and runs the payload back through `makeGame` (see Part 4) so
     `Decimal` instances are reconstructed.
   - Seed `data` + `lastFetchedAt` from the cache so the dashboard
     paints on first render.
   - In a `useEffect`, pull the DO snapshot (see Part 6). If a sweep
     updated the Durable Object since this device last fetched, replace
     the cache with the fresher payload — without spending an upstream
     call.
2. **`useNow(1000)` ticks** so countdowns re-render once a second.
3. **Derive memos** in `App` (`timers` from `extractAndAggregate`,
   grouped `byCategory`, gated `visibleCategories`, cooldown).
4. **`useNavSections({...})`** produces the MobileNav strip.
5. **Render** the header + grid + nav + floating buttons.

### Fetching a farm

`load(id)` (returned by [`useFarmData`](../src/hooks/useFarmData.ts))
calls [`fetchFarm`](../src/api/fetchFarm.ts):

- It hits `/api/farms/{id}` on the **same origin** — there's no `x-api-key`
  in the request from the browser. Vite's dev server proxies that path to
  `wrangler dev` on `:8787`; in production the Cloudflare Worker handles
  it directly.
- The response is `{ farm, id, updatedAt? }`. `farm` is a `GameState`
  JSON blob with plain numbers — `makeGame` from the submodule hydrates
  the `Decimal` fields (inventory, balance, stock) so upstream helpers
  that call `.gt(0)` / `.add(...)` work.
- We write the raw payload back to `localStorage` for next reload.
- Best-effort: if this device has a push subscription, we POST the _same
  payload_ we just received to `/push/refresh`. The Worker forwards it
  straight to the DO so other devices can `GET /push/state` and pick up
  the latest snapshot — without us paying for a second upstream call.

Two error classes are thrown for the UI to distinguish:

- `ApiError` — generic non-2xx, rendered as red text.
- `AccessDeniedError` — the player's farm isn't in the access cohort
  yet. The dashboard hides and a friendly "check back later" message
  shows in its place.

### Live timer ticking

[`useNow`](../src/hooks/useNow.ts) is a one-line hook that updates state
every 1000 ms. Every component that needs a live "X minutes left"
re-renders once a second from this single timer. `App` recomputes
`extractAndAggregate(state, id, now)` each tick — cheap because it's
pure data manipulation, no React tree work upstream of `App`.

### Layout

The dashboard is one CSS multi-column container ([DashboardGrid](../src/app/DashboardGrid.tsx))
with `break-inside-avoid` on every panel. CSS handles balancing column
heights across 1 / 2 / 3 / 4 columns by breakpoint. There's no manual
layout code per panel — adding a new section is just appending it inside
the container.

The mobile nav strip (`<MobileNav>`) is a horizontal scrollable chip rail.
The list of chips is built declaratively by
[useNavSections](../src/hooks/useNavSections.ts) from the same data the
panels render, so order stays in sync.

### Refresh behaviour

The floating refresh button has a **60s cooldown** — the local cache is
considered fresh inside that window, and the button shows a countdown
ring instead of doing anything. Beyond that, it calls the same `load(id)`
path as the initial fetch.

A separate **version probe** ([`useVersionCheck`](../src/hooks/useVersionCheck.ts))
fetches `/version.json` every 5 minutes. Each build emits a `version.json`
containing the commit SHA; the running bundle compares against its own
`VITE_COMMIT_SHA`, and if they differ the header shows a "click to
refresh" prompt that does a cache-busting reload.

---

## Part 2 — The Cloudflare Worker

The Worker lives in [worker/](../worker/) and is built into
`dist-worker/index.js` by Vite (see Part 8). It's deployed by `wrangler`.
A single Worker handles **all** server-side routes — there is no
traditional backend.

The Worker's entry is [worker/index.ts](../worker/index.ts). Its `fetch`
handler maps URL paths to handlers. The handler list:

| Path                | Method | What it does                                                |
| ------------------- | ------ | ----------------------------------------------------------- |
| `/api/farms/{id}`   | GET    | Proxy a farm load through the access gate (Part 3).         |
| `/push/vapid`       | GET    | Return the VAPID public key so the SPA can subscribe.       |
| `/push/subscribe`   | POST   | Register a new push subscription on a farm's DO.            |
| `/push/unsubscribe` | POST   | Drop a subscription from a farm's DO.                       |
| `/push/categories`  | POST   | Update per-device mute list.                                |
| `/push/target`      | POST   | Set "open Overview" vs "open main game" per device.         |
| `/push/test`        | POST   | Send one test push to the calling device.                   |
| `/push/refresh`     | POST   | Forward a freshly-fetched snapshot to the DO.               |
| `/push/state/{id}`  | GET    | Hand back the DO's latest snapshot, conditional on `since`. |
| `/push/sweep`       | POST   | Admin-only: manually trigger the coordinator sweep.         |
| anything else       | \*     | Falls through to `env.ASSETS.fetch(request)` → the SPA.     |

### Per-IP rate limit

Every `/api/*` and `/push/*` request goes through the
`PUSH_RATE_LIMITER` binding (60 req / 60s per IP per route). The route
key is bucketed — `/api/farms/{id}` collapses to `/api/farms` so
rotating IDs can't bypass the limit. See [wrangler.jsonc](../wrangler.jsonc).

### Why path proxying instead of direct upstream calls?

Two reasons:

1. **API key never reaches the browser.** The upstream community API
   requires an `x-api-key` header. If the SPA held one, anyone with
   devtools could read it. Instead, the Worker holds a single **master
   HMAC secret** and _mints a per-farm key_ for each request. See
   [worker/communityApi.ts](../worker/communityApi.ts):
   `mintFarmKey(farmId, secret)` returns
   `sfl.{base64url(farmId)}.{HMAC-SHA256(secret, payload)}`. The upstream
   accepts the key only for the encoded farm.

2. **Trust boundary for cohort gating.** Both the SPA _and_ the Worker
   re-run `hasOverviewAccess(state)`. Even if a player tampered with
   client code, the Worker re-checks and returns 403.

### Cron — the Coordinator sweep

`wrangler.jsonc` sets `triggers.crons: ["*/10 * * * *"]`. Every 10 minutes
Cloudflare fires the Worker's `scheduled()` handler, which calls
`sweep(env)` ([worker/coordinator.ts](../worker/coordinator.ts)):

1. Read every opted-in `farm_id` from D1.
2. Chunk into batches of 100.
3. For each batch, `POST /community/getFarms { ids }` upstream (this is
   the legacy id-form endpoint; the un-deprecated paginated one would
   require scanning every farm in the BE).
4. For each returned farm, `fetch` its FarmPushDO at
   `/onSnapshot`, handing it the new game state. The DO re-runs the
   timer extractor and updates its scheduled fires.

Worst case is bounded by the 25-minute wall-clock cap in the sweep loop
— well inside Cloudflare's per-cron budget. A `sweepInFlight` module
flag prevents the manual `/push/sweep` admin endpoint from racing with
the scheduled tick.

---

## Part 3 — Auth, cohort gating, and the community key

When the SPA hits `/api/farms/{id}`, the Worker runs
[`fetchAndCheckAccess`](../worker/access.ts):

1. Mint a per-farm key from `SFL_COMMUNITY_API_KEY`.
2. Forward the player's IP on `x-forwarded-client-ip` (paired with
   `x-support-key`) so the BE's per-IP throttle scopes per-player
   instead of treating every overview load as coming from one egress IP.
3. Call upstream `GET /community/farms/{id}`.
4. Parse the body. Re-validate the cohort predicate.
5. If denied, return 403 `{ error: "access_denied" }`. The SPA's
   `fetchFarm` catches this and throws `AccessDeniedError`.
6. If approved, stamp `__proxyFetchedAt: Date.now()` on the body and
   return it to the SPA.

That `__proxyFetchedAt` field is important: when the SPA later forwards
this body to `/push/refresh`, the DO checks it's strictly **newer** than
its current snapshot. Stops a malicious subscriber (or an
out-of-order delivery from a second device) from rolling DO state
backwards and un-scheduling alarms held by other devices.

### Local-dev shortcut

If `SFL_COMMUNITY_API_KEY` already _looks like_ a pre-minted per-farm
key (`sfl.X.Y` shape), `mintFarmKey` returns it unchanged. So you can
paste your in-game **Settings → Developer Options → API Key** as the
local secret without needing the master HMAC. It'll work for that one
farm only.

---

## Part 4 — Game logic & timer extraction

This is the most subtle part of the codebase and the one the project
rule [in CONTRIBUTING.md](../CONTRIBUTING.md#never-replicate-functions-from-the-submodule)
exists to protect.

### The submodule boundary

[src/game/index.ts](../src/game/index.ts) is the **only** module that
imports from `sunflower-land/`. Every other file in the overview
imports from `../game/index.ts`. That means:

- Want a yield function? Re-export it from `src/game/index.ts`.
- Want a type? Same.
- Want a constant? Same.

Why: when upstream renames or refactors something, you get one compile
error in `src/game/index.ts` instead of a hundred scattered across
timer files. And — critically — when upstream adds a new boost or
gate, every yield computation in the overview picks it up automatically
because we _call_ the upstream function, never copy it.

`src/game/yields.ts` and `src/game/batch-yields.ts` are **thin wrappers**
that narrow types or thread a counter through a batch loop. They don't
re-implement upstream math. Don't add `if (skill X) amount += N` style
code here.

### `makeGame`

The BE returns plain JSON numbers, but upstream helpers (animal boost
checks etc.) call methods like `.gt(0)` and `.add(1)` on inventory
fields. Those are `Decimal` methods. So both the SPA and the DO run the
raw payload through `makeGame` (re-exported from
`features/game/lib/transforms`) to hydrate those fields. Done.

### Timer extractors

[src/timers/](../src/timers/) holds one extractor per category. Each
exports an `extract*Timers(state, ctx)` that returns `Timer[]`:

```ts
export type Timer = {
  id: string; // unique per source
  category: Category; // "Crops" | "Animals" | …
  label: string; // e.g. "Sunflower"
  readyAt: number; // ms-since-epoch
  predictedYield?: { amount; item };
  boosts?: Boost[]; // surfaced in the tooltip
  aggregationKey?: string; // → group sources into one card
  slots?: TimerSlot[]; // multi-slot cards (cooking)
  // ...etc — see src/timers/types.ts
};
```

`extractAllTimers(state, farmId, now)` invokes every extractor and
concatenates results. `extractAndAggregate` then groups by
`aggregationKey` via [`aggregateTimers`](../src/timers/aggregate.ts):

- `count` = number of merged plots
- `predictedYield.amount` = sum of source yields
- `readyAt` = earliest among the group
- `boosts` = deduped union (counting each boost's plot population)
- `instances` = per-source `{readyAt, amount}` pairs, only populated when
  `count > 1`. The notification scheduler reads this to cluster
  "5 zucchini ripening over 20 seconds" into one push.

### The PRNG counter

`TimerContext` carries a `counter: { next() }` closure. Each upstream
yield function uses this to advance its per-item PRNG sequence. Without
threading the counter, a row of 5 identical crops would all roll the
same chance-based bonus.

### Where to add a new category

1. Write `src/timers/foo.ts` exporting `extractFooTimers(state, ctx)`.
2. Add it to the array in `extractAllTimers` ([src/timers/index.ts](../src/timers/index.ts)).
3. Add `"Foo"` to the `Category` union and `CATEGORY_ORDER` array
   ([src/timers/types.ts](../src/timers/types.ts)).
4. Optionally add an icon mapping in `src/components/categoryIcon.ts`.

The UI picks up the new category automatically — `App.tsx` iterates
`CATEGORY_ORDER`.

---

## Part 5 — The push notification flow

Web Push is plumbed end-to-end. Following the lifecycle:

### Step 1 — Player opts in

In Settings → Notifications, the player taps **Enable**. The SPA:

1. Calls `Notification.requestPermission()`.
2. Fetches `GET /push/vapid` to learn the current VAPID public key.
   (Not baked into the bundle — makes rotation possible without a redeploy.)
3. Calls `navigator.serviceWorker.getRegistration()` then
   `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
   The browser returns a `PushSubscription` containing an `endpoint`
   URL pointing at the player's browser vendor's push service (FCM,
   Mozilla, Apple, etc).
4. POSTs `{ farmId, subscription }` to `/push/subscribe`.

Code: [src/notifications/subscribe.ts](../src/notifications/subscribe.ts),
[src/components/NotificationSettings.tsx](../src/components/NotificationSettings.tsx).

### Step 2 — Worker validates and stores

[`handlePushSubscribe`](../worker/index.ts) does:

1. Validate the endpoint is `https`, default-port, and on an allowlisted
   push host (FCM / Mozilla / Apple / Windows). Stops attackers stashing
   a dead URL or attacker-controlled one in D1.
2. Run the access gate (Part 3). Forward the access body to the DO so
   it doesn't need a second upstream call.
3. Forward to the per-farm Durable Object via
   `env.FARM_PUSH_DO.idFromName(String(farmId))`.

[`handleSubscribe`](../worker/farmPushDO.ts) on the DO side:

1. Cap distinct endpoints at 10 per farm.
2. Apply the forwarded snapshot via `applySnapshot(raw, { seedAlreadyReady: true })`.
   That seed flag means: any timer already ready _right now_ gets
   recorded in `notified` without firing — so enabling notifications on
   a farm with a backlog of ripe crops doesn't dump a wall of pushes.
3. Persist the subscription in state.
4. `INSERT OR IGNORE` into the D1 `opted_in` table — that's what the
   coordinator sweep iterates.

### Step 3 — Coordinator schedules fires

Every 10 minutes, the sweep (Part 2) calls `applySnapshot(raw)` on each
DO. That:

1. Hydrates with `makeGame`.
2. Runs `extractAndAggregate` over the snapshot.
3. For each aggregated timer, builds one or more
   `{ fireKey, readyAt, title, body, icon, category }` entries via
   `instancesFor(t)`:
   - **slot-based** (cooking): one fire per slot.
   - **instances[]** (clustered plants/animals): one fire per cluster,
     headline carries the cluster amount.
   - **fallback**: one fire per timer.
4. Diffs against `state.scheduled`. Cancels obsolete alarms via
   `cancelSchedule`, schedules new ones via `this.schedule(delaySec,
"fireTimer", payload)` — from the `agents` library, which persists
   the schedule across DO restarts.
5. Caps stored fires at `MAX_SCHEDULED_PER_DO` (200) — earliest readyAts
   win, anything past that is dropped with a warning.

The whole `applySnapshot` short-circuits if the farm's upstream
`updatedAt` matches what we last saw (nothing meaningful changed; same
extractor output would result). The seed path on subscribe skips that
short-circuit because seeding-already-ready needs to run unconditionally.

### Step 4 — Alarm fires → push dispatched

When `readyAt` hits, `fireTimer(payload)` runs:

1. Drop if `fireKey` is in `notified` (idempotency — alarms guarantee
   at-least-once).
2. Filter subscriptions whose `mutedCategories` includes the fire's
   category (per-device mute).
3. Split remaining subscriptions by `notificationTarget` (overview vs
   play). Each group gets a payload with the right click URL.
4. `dispatchPush(payload, group)` → `sendAll` →
   [`sendOne`](../worker/push.ts) → `webpush.sendNotification(...)`.
   Sends an encrypted, VAPID-signed message to the push service for
   that subscription.
5. Prune any subscription that returned 404/410 — the push service
   reports those when an endpoint is permanently gone.
6. Record the fire in `notified` (GC'd after 7 days).

### Step 5 — Browser delivers to the service worker

The browser receives the encrypted message from the push service,
decrypts it with the SW's private VAPID material (managed by the
browser), and dispatches a `push` event to the registered service worker.

[src/sw.ts](../src/sw.ts) `push` handler:

```js
event.waitUntil(
  self.registration.showNotification(title, {
    body,
    tag,
    icon,
    badge,
    data: { url },
  }),
);
```

The `tag` is the `fireKey` — if a re-fire happens, the OS replaces the
existing notification in place rather than stacking duplicates.

### Step 6 — Player taps

The SW's `notificationclick` handler:

- Closes the notification.
- Parses `data.url`. If it's same-origin, focuses an existing tab on
  that path or opens a new one. If it's an allowlisted external origin
  (`sunflower-land.com`), it routes through `/launch.html#to=...` —
  a same-origin bounce page that gives Chrome a chance to launch the
  destination PWA (cross-origin `clients.openWindow` opens a plain tab
  even if the user has the target installed).

### iOS quirk

iOS Safari only delivers Web Push when the PWA is **installed to the
Home Screen**. [src/notifications/permission.ts](../src/notifications/permission.ts):

- `canSubscribe()` returns false on iOS unless `isStandalone()`.
- `isIOS()` includes the `maxTouchPoints > 1 && /Mac/.test(platform)`
  branch that catches iPadOS's desktop-class UA — without it, iPad users
  would skip the "Install Required" copy and then fail opaquely at
  `pushManager.subscribe()`.

NotificationSettings shows a "Install required → Add to Home Screen"
panel instead of the toggle in that case.

---

## Part 6 — The Durable Object's freshness model

A Durable Object is essentially a tiny stateful single-tenant service —
one per `idFromName(farmId)`. It holds:

```ts
type State = {
  farmId: number | null;
  subscriptions: StoredSubscription[];
  snapshot?: { raw: FarmResponse; fetchedAt: number };
  snapshotUpdatedAt?: string;
  scheduled: Record<fireKey, PendingFire>;
  notified: Record<fireKey, recordedAt>;
  lastActivityAt?: number;
};
```

Three things write the snapshot:

1. **Subscribe.** Forwarded access-check body, or upstream fetch if no
   recent snapshot.
2. **Coordinator sweep.** `/onSnapshot` from the cron handler.
3. **SPA refresh.** `/push/refresh` forwards the SPA's `/api/farms/{id}`
   response body. The `__proxyFetchedAt` stamp gates trust — older than
   our current snapshot? Reject and fall through to a real upstream fetch.

One thing reads the snapshot:

- **`GET /push/state/{id}?since={ts}`.** Used by the SPA on PWA reopen
  to ask the DO whether it has seen anything newer than the local cache
  ([src/notifications/snapshot.ts](../src/notifications/snapshot.ts)).
  If yes, the SPA overwrites its `localStorage` cache without paying
  for an upstream fetch.

### TTL vacuum

`OPT_IN_TTL_MS = 30 days`. If a DO goes 30 days without observing any
activity (subscribe, `/push/state` poll, `/push/refresh`, or a successful
push delivery), the next coordinator sweep will `cleanup()` it — clears
subscriptions + scheduled fires, deletes the D1 row. This is how
abandoned subscriptions stop costing us forever.

### What "activity" means

`touchActivity()` fires on:

- Subscribe.
- `/push/state` poll (PWA reopen).
- Successful `/push/refresh`.
- A push delivery returning `sent > 0`.

Pruning-only fan-outs (every result was 404/410) don't count — that's
evidence of churn, not life.

---

## Part 7 — Caching, freshness, and cross-device sync

Three caches, all keyed by farmId:

| Cache                       | Where         | Lifetime                                                 | Authority                                    |
| --------------------------- | ------------- | -------------------------------------------------------- | -------------------------------------------- |
| `localStorage` farm payload | Browser       | 7 days TTL ([src/lib/storage.ts](../src/lib/storage.ts)) | Seed only                                    |
| DO `state.snapshot`         | Cloudflare DO | 30-day inactivity vacuum                                 | Authoritative for "what the coordinator saw" |
| BE `FarmModel`              | Upstream      | n/a                                                      | Source of truth                              |

### How a multi-device user stays in sync

Player has the PWA on phone + desktop:

1. Plants crops in the main game (sunflower-land.com).
2. BE bumps `FarmModel.updatedAt`.
3. Coordinator sweep (next 10 min) sees the new `updatedAt`, re-runs
   the extractor, reschedules alarms.
4. Phone opens the PWA → `pullDoSnapshot` finds a newer snapshot →
   localStorage updates → dashboard re-renders.
5. Desktop opens the PWA → same thing.
6. Player taps refresh on phone → SPA fetches `/api/farms/{id}` →
   forwards body to `/push/refresh` → DO updates immediately → desktop
   sees fresh data on its next `/push/state` poll without waiting for
   the next sweep.

The `__proxyFetchedAt` field prevents step 6 from rolling back state if
an old body shows up out-of-order.

---

## Part 8 — Build, deploy, and config

### Two bundles

```sh
npm run build         # client + worker
npm run build:client  # → dist/        (SPA, served by env.ASSETS)
npm run build:worker  # → dist-worker/ (Worker entrypoint)
```

The client bundle is configured by
[vite.config.ts](../vite.config.ts):

- `@vitejs/plugin-react` (React)
- `@tailwindcss/vite` (Tailwind v4)
- `vite-plugin-pwa` with `injectManifest` — we own the service worker
  source at [src/sw.ts](../src/sw.ts) so we can wire push handlers.
- A tiny inline plugin that emits `/version.json` on every build (the
  staleness probe in Part 1 reads it).
- Heavy resolve-aliasing so `import "features/game/types/crops"` resolves
  into the `sunflower-land/` submodule, and asset / lib stubs replace
  upstream code paths we don't need (audio, i18next, lodash).

The worker bundle uses a separate
[vite.worker.config.ts](../vite.worker.config.ts) with the same aliases
but a Worker target.

### Wrangler config

[wrangler.jsonc](../wrangler.jsonc) wires:

- `main: dist-worker/index.js`
- `assets`: serves `dist/` with SPA fallback (any 404 returns `index.html`).
- `d1_databases`: binding `sfl_overview_push` (migrations in [migrations/](../migrations/)).
- `durable_objects`: binding `FARM_PUSH_DO → FarmPushDO`.
- `triggers.crons`: `*/10 * * * *`.
- `vars.VAPID_SUBJECT`: plain (non-secret) email used as the VAPID JWT
  subject. Everything else (API keys, VAPID private, admin secret) is a
  `wrangler secret`.
- `ratelimits`: the `PUSH_RATE_LIMITER` binding used in `index.ts`.

### Submodule lifecycle

[.github/workflows/bump-sunflower-land-submodule.yml](../.github/workflows/bump-sunflower-land-submodule.yml)
runs daily at 06:00 UTC: it fast-forwards the submodule to upstream
`main` and pushes the bump commit. This is why the project's main
contributor rule is "call upstream functions directly, don't re-implement
them" — the submodule moves under us every day, and any code that
duplicates upstream math will silently rot without compile errors.

### What runs where in dev

```sh
npm run wrangler   # Worker on :8787 (D1, DO, cron all local)
npm run dev        # Vite SPA on :3000; proxies /api + /push to :8787
npm run worker     # vite build --watch for the Worker
```

You can skip the third terminal if you don't expect to edit Worker
code — just `npm run build:worker` after each Worker edit.

---

## Part 9 — Reading the code

If you're trying to trace a specific feature, here's the suggested path:

| Question                            | Read this in order                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "How does X get computed?"          | `src/timers/{X}.ts` → `src/game/index.ts` → submodule yield fn                                                                               |
| "How does the dashboard render Y?"  | `src/app/App.tsx` → `src/app/DashboardGrid.tsx` → `src/components/{Y}Panel.tsx`                                                              |
| "How does the farm get loaded?"     | `src/hooks/useFarmData.ts` → `src/api/fetchFarm.ts` → `worker/index.ts` `handleProxyFarm`                                                    |
| "How does Z get pushed?"            | `src/notifications/...` (client) → `worker/index.ts` (route) → `worker/farmPushDO.ts` (DO) → `worker/push.ts` (send) → `src/sw.ts` (browser) |
| "How does the sweep work?"          | `worker/index.ts` `scheduled()` → `worker/coordinator.ts` → `worker/farmPushDO.ts` `handleOnSnapshot`                                        |
| "Where does the API key come from?" | `worker/index.ts` `handleProxyFarm` → `worker/access.ts` → `worker/communityApi.ts` `mintFarmKey`                                            |

A useful first exercise: pick one category (say, beehives) and trace
it end to end — from `src/timers/beehives.ts`, through aggregation,
into the DO's `instancesFor`, into a push payload, into `sw.ts`.

---

## Glossary

- **SPA** — Single Page App. The React frontend.
- **PWA** — Progressive Web App. An SPA that's installable and has a
  service worker. Adds notification + offline support.
- **Service Worker** — A browser-managed background JS context. Lives
  past tab close, handles `push` / `notificationclick` / fetch caching.
- **Cloudflare Worker** — Cloudflare's serverless JS runtime. Hosts our
  backend. Different from a Service Worker despite the name overlap.
- **Durable Object (DO)** — Cloudflare's single-tenant stateful primitive.
  One instance per farmId in our case. Holds subscriptions + alarms.
- **D1** — Cloudflare's SQLite-backed database. We use one table:
  `opted_in`.
- **VAPID** — Voluntary Application Server Identification. A signing
  scheme for Web Push that proves the sender is who they say they are.
  Public key goes to the browser at subscribe time; private key signs
  every push.
- **Community API** — The official Sunflower Land BE endpoint set under
  `/community/*`. Read-only, authenticated with an HMAC-signed per-farm
  key.
- **Snapshot** — A `{ raw: FarmResponse, fetchedAt: number }` envelope.
  Whatever upstream returned, plus when we observed it.
- **GameState** — The deserialised farm object. Defined upstream; we
  import the type via the submodule.
- **`makeGame`** — Upstream helper that hydrates plain-JSON inventory
  numbers into `Decimal` instances.
- **fireKey** — Stable unique identifier for one scheduled push. Used as
  the OS notification `tag` so re-fires replace in place, and as the
  dedup key in `notified`.
- **Cohort gate** — The access check that decides whether a farm can use
  the overview. Both client and Worker enforce it.
