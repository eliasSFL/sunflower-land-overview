# Sunflower Land Overview

A community tool that shows **live timers** for your Sunflower Land farm — Crops, Fruit Patches, Greenhouse, Crop Machine, and Flowers — with predicted yields that match what the game would award on harvest.

> Not affiliated with Sunflower Land. Data is read from the official public Community API.

## Usage

1. In the game: **Settings → Developer Options → API Key** to generate your key.
2. Open the app, enter your **Farm ID** and **API Key**, click **Load farm**.
3. Click **Refresh** to pull a fresh snapshot (60-second cooldown for the same farm; switching farm or key submits immediately).

Your farm ID and API key are stored in `localStorage` on your device only — they're sent to `https://api.sunflower-land.com` via a same-origin proxy.

## Develop

This repo references the [sunflower-land](https://github.com/sunflower-land/sunflower-land) game source as a git submodule at [`sunflower-land/`](sunflower-land/), tracking the `main` branch. Yield + duration logic is imported from the submodule directly so estimates always match what the game would compute.

```sh
git clone --recurse-submodules https://github.com/eliasSFL/sunflower-land-overview.git
cd sunflower-land-overview
npm install
npm run dev
```

If you cloned without `--recurse-submodules`:

```sh
git submodule update --init --remote --depth 1
```

Pull the latest upstream `main`:

```sh
git submodule update --remote --depth 1 -- sunflower-land
```

`tsc -b` surfaces drift between our bridge wrappers and the submodule's signatures on the next build.

## Build / preview / deploy

```sh
npm run build       # tsc -b && vite build
npm run preview     # build then `wrangler dev` against dist/
npm run deploy      # build then `wrangler deploy`
```

## Stack

- Vite 8 + React 19 + TypeScript 6
- Tailwind CSS v4 (CSS-first config in [`src/index.css`](src/index.css))
- Pixel-art chrome re-exported from the sunflower-land submodule (`Panel`, `InnerPanel`, `Button`, `Label`)
- Cloudflare Worker + Static Assets binding ([`worker/index.ts`](worker/index.ts) + [`wrangler.jsonc`](wrangler.jsonc))

## Architecture

```
src/
  app/              App.tsx, top-level layout + state
  components/       FarmIdForm, TimerSection, TimerCard
    sfl-ui/         re-exports Panel/InnerPanel/OuterPanel/Button/Label
  game/             SUBMODULE BOUNDARY — only place that imports from sunflower-land/
    yields.ts       getCropYieldAmount, getPatchFruitYield, getGreenhouseYield, getCropMachinePackYield
    flowers.ts      getFlowerAmount + getFlowerGrowSeconds
    icons.ts        getItemIcon, getBannerUrl
    types.ts        narrowed GameState + per-category shapes
    stubs/          Vite-aliased stubs for transitive deps we don't execute (xstate, react-spring, ...)
  timers/           one file per category
    crops.ts        Crops
    fruits.ts       Fruit Patches
    greenhouse.ts   Greenhouse (Rice / Olive / Grape)
    cropMachine.ts  Crop Machine (per-slot, threaded PRNG counter)
    flowers.ts      Flowers
    aggregate.ts    groupBy aggregationKey, sum yields, take min readyAt
    index.ts        extractAndAggregate(state, farmId, now)
  api/fetchFarm.ts  /api/farms/:id with x-api-key header
  hooks/useNow.ts   1-second ticker
  lib/              format, durations, storage
worker/index.ts     Cloudflare Worker — /api/farms/:id proxy + ASSETS fallback
```

**The boundary rule (enforced by ESLint):** anything that imports from `features/*`, `lib/*`, `components/*`, `metadata/*`, or `assets/*` (the bare specifiers Vite resolves into the submodule) must live under `src/game/**` or `src/components/sfl-ui/**`. Everything else imports from `src/game/` for typed re-exports — drift in upstream signatures fails to compile there, not at every callsite.

## How the API call works

`api.sunflower-land.com` only allows browser requests from a small set of `sunflower-land.com` origins. The frontend calls a same-origin path (`/api/farms/{id}`) which is proxied to the real API:

- **Locally** — handled by the Vite dev proxy in [`vite.config.ts`](vite.config.ts).
- **In production** — handled by [`worker/index.ts`](worker/index.ts), a Cloudflare Worker. The user's `x-api-key` header flows through the worker but is never logged or stored. Static assets fall through to the Worker's `ASSETS` binding (set up in [`wrangler.jsonc`](wrangler.jsonc)) for SPA serving.

The asset CDN URL (`VITE_PRIVATE_IMAGE_URL`) is inlined as a build-time constant via Vite's `define` in [`vite.config.ts`](vite.config.ts) — no `.env` file or Cloudflare environment variable needed.

## Deploy (Cloudflare Workers)

1. Push to GitHub.
2. The build command is `git submodule update --init --remote --depth 1 && npm run build` so production builds always pick up the latest submodule `main`.
3. `npm run deploy` invokes `wrangler deploy`, which uploads the worker + the contents of `dist/` as static assets bound to `ASSETS` in [`wrangler.jsonc`](wrangler.jsonc).

> `--remote` re-fetches `main` of the sunflower-land submodule on every deploy, so each build uses the latest game source. `--depth 1` keeps the clone shallow (the upstream repo is large). The pinned commit in `.gitmodules` is only used as a fallback.

## Adding a new timer category

1. Extend [`src/game/types.ts`](src/game/types.ts) with the slice of `GameState` your category reads (crop machine slots, beehive state, etc.).
2. If you need a new yield/duration helper, add it to [`src/game/yields.ts`](src/game/yields.ts) (or a sibling like `flowers.ts`) and re-export from [`src/game/index.ts`](src/game/index.ts).
3. Create `src/timers/<category>.ts` exporting `extract<Category>Timers(state, ctx): Timer[]`. Use `ctx.counter.next()` per item if your yield calc consumes a PRNG counter — that keeps yields stable across renders.
4. Wire it into `extractAllTimers` in [`src/timers/index.ts`](src/timers/index.ts).
5. Add the category name to [`src/timers/types.ts`](src/timers/types.ts) (`Category` union + `CATEGORY_ORDER`).

The UI picks new categories up automatically — `App.tsx` iterates `CATEGORY_ORDER` and renders a `TimerSection` per non-empty group.
