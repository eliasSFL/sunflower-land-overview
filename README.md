# Sunflower Land Overview

A community tool that shows **live timers** for your Sunflower Land farm — crops, fruit, greenhouse, cooking, composters, animals, beehives, deliveries, and bounties — all in one place.

> Not affiliated with Sunflower Land. Data is read from the official public Community API.

## Usage

1. Open the app and enter your **Farm ID** (the number next to your name in the main game).
2. Timers refresh automatically; the floating refresh button forces an immediate fetch.
3. Optional: open Settings → **Notifications** to subscribe to push notifications when timers come due, and pick which categories you want to be notified about.

Your farm ID is stored in `localStorage` on your device only. The browser never sends an API key — the Worker mints a per-farm community key from a master secret on the server side.

## Run locally

You need **two** processes running side-by-side: the Vite dev server (SPA) and `wrangler dev` (the Cloudflare Worker, which handles `/api/farms/:id` and `/push/*`). Vite proxies those paths to `localhost:8787` ([`vite.config.ts`](vite.config.ts)).

### 1. Clone with the game submodule

The game source ([sunflower-land](https://github.com/sunflower-land/sunflower-land)) is a git submodule at [`./sunflower-land/`](sunflower-land/), tracking `main`. The yield/timer extractors in [`src/timers/`](src/timers/) and [`src/game/`](src/game/) import its harvest functions directly so estimates match what the game would compute.

This project uses **Yarn Classic (1.x)**. Install it with `npm i -g yarn` if you don't have it yet.

```sh
git clone --recurse-submodules https://github.com/eliasSFL/sunflower-land-overview.git
cd sunflower-land-overview
yarn install
```

If you cloned without `--recurse-submodules`:

```sh
git submodule update --init --remote --depth 1
```

To pull the latest upstream `main` later:

```sh
git submodule update --remote --depth 1 -- sunflower-land
```

### 2. Configure environment

Two files, both gitignored:

```sh
cp .env.example .env             # Vite (client) — CDN + network
cp .dev.vars.example .dev.vars   # Wrangler (worker) — secrets
```

- `.env` — only needed if you want to override the asset CDN or talk to testnet.
- `.dev.vars` — the Worker reads this automatically. The two things that matter for local dev:
  - `SFL_COMMUNITY_API_KEY` — master HMAC secret used to mint per-farm community keys for `/api/farms/:id`. Without it, farm fetches return 503. For local-only experimentation you can paste a single-farm community key (in-game **Settings → Developer Options → API Key**); the Worker auto-detects that shape and uses it as-is, scoped to that one farm.
  - `VAPID_PUBLIC` / `VAPID_PRIVATE` — only needed if you want to test push notifications. Generate a *local* keypair with `npx web-push generate-vapid-keys --json` (don't reuse the prod keys — the public key is baked into each device's subscription, so mixing dev/prod will break pushes).

### 3. Start the three dev processes

```sh
# terminal 1 — Worker on :8787 (serves dist-worker/index.js, hot-reloads on rebuild)
yarn wrangler

# terminal 2 — SPA on :3000
yarn dev

# terminal 3 — rebuild the Worker bundle on every save
yarn worker
```

Open <http://localhost:3000>. API calls (`/api/farms/:id`, `/push/*`) are forwarded to the Worker by the Vite proxy.

> Why three terminals? `wrangler.jsonc`'s `main` points at the pre-built `dist-worker/index.js`. Wrangler can't run `worker/index.ts` directly because the Worker bundle relies on the path aliases, asset-CDN plugin, and submodule stubs in [`vite.worker.config.ts`](vite.worker.config.ts). `yarn worker` (a `vite build --watch`) rebuilds that bundle on save, and `wrangler dev` hot-reloads when the file changes. For a one-shot session you can skip terminal 3 and just `yarn build:worker` manually after each Worker edit.

### Smoke-testing without setting up push

Hit the Worker directly:

```sh
curl http://localhost:8787/api/farms/<your-farm-id>
curl -X POST http://localhost:8787/push/categories \
  -H 'content-type: application/json' \
  -d '{"farmId":1,"endpoint":"https://example/x","mutedCategories":["Crops"]}'
```

A `404 Unknown endpoint` from the categories call means the route is wired correctly — there's just no subscription registered for that fake endpoint.

## Build

```sh
yarn build      # builds both the SPA (dist/) and the Worker (dist-worker/)
yarn preview    # `wrangler dev` against the most recent build in dist/ and dist-worker/
yarn deploy     # `wrangler deploy` against the most recent build (run `yarn build` first)
```

## Deploy

Production deploys run on **Cloudflare Workers Builds** (dashboard → Workers & Pages → this project → Settings → Build), git-connected to the repo:

- **Build command:** `yarn build`
- **Deploy command:** `npx wrangler deploy`
- **Version command:** `npx wrangler versions upload`

Cloudflare auto-detects yarn from `yarn.lock` and runs `yarn install` before the build command. That triggers the `postinstall` hook, which shallow-clones the `sunflower-land` submodule at the pinned SHA — so deploys are reproducible (same parent commit → same artifact). [`.github/workflows/bump-sunflower-land-submodule.yml`](.github/workflows/bump-sunflower-land-submodule.yml) auto-bumps that SHA daily; trigger it manually via `workflow_dispatch` before a deploy if you need the very latest game logic.

## Stack

- Vite + React + TypeScript (SPA)
- Tailwind CSS v4
- Cloudflare Worker with a Durable Object per farm + a D1-backed opt-in registry and a 10-minute cron sweep for push notification scheduling. See [`worker/`](worker/).
- `vite-plugin-pwa` with a hand-rolled service worker ([`src/sw.ts`](src/sw.ts)) for `push` + `notificationclick` handlers.

## Adding new timers

Each category has its own extractor in [`src/timers/`](src/timers/) (e.g. [`crops.ts`](src/timers/crops.ts), [`beehives.ts`](src/timers/beehives.ts)). Add a function that returns `Timer[]` and wire it into [`src/timers/index.ts`](src/timers/index.ts); the UI will pick it up via `CATEGORY_ORDER` automatically. See [`CLAUDE.md`](CLAUDE.md) for the rule about calling upstream helpers directly rather than re-implementing yield math.
