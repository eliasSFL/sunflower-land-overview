# Sunflower Land Overview

A community tool that shows **live timers** for your Sunflower Land farm — crops, fruit, greenhouse, cooking, composters, animals, beehives, deliveries, and bounties — all in one place.

> Not affiliated with Sunflower Land. Data is read from the official public Community API.

## Usage

1. In the game: **Settings → Developer Options → API Key** to generate your key.
2. Open the app, enter your **Farm ID** and **API Key**.
3. Timers refresh automatically every 60 seconds.

Your farm ID and API key are stored in `localStorage` on your device only — they are sent directly to `https://api.sunflower-land.com` from your browser.

## Develop

This repo references the [sunflower-land](https://github.com/sunflower-land/sunflower-land) game source as a git submodule at `./sunflower-land/`, tracking the `main` branch. The yield-prediction service in [`src/lib/yields.ts`](src/lib/yields.ts) imports the game's harvest functions directly so estimates always match what the game would compute on harvest.

Local development uses whatever commit of `main` you fetched last; production builds (Cloudflare Pages, see below) re-fetch `main` HEAD on every deploy so the deployed yields stay aligned with the live game.

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

To pull the latest upstream `main` after the initial clone:

```sh
git submodule update --remote --depth 1 -- sunflower-land
```

`tsc` surfaces any drift in the predictor calls on the next build.

## Build

```sh
npm run build
npm run preview
```

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Cloudflare Pages Function for the API proxy

## How the API call works

`api.sunflower-land.com` only allows browser requests from a small set of `sunflower-land.com` origins. To avoid the CORS restriction without changing the API, the frontend calls a same-origin path (`/api/farms/{id}`) which is proxied to the real API:

- **Locally** — handled by the Vite dev proxy in [`vite.config.ts`](vite.config.ts).
- **In production** — handled by [`functions/api/farms/[id].ts`](functions/api/farms/%5Bid%5D.ts), a Cloudflare Pages Function. The user's API key flows through the function as a header but is never logged or stored.

## Deploy (Cloudflare Pages)

1. Push to GitHub (already done).
2. In Cloudflare dashboard → Pages → "Create a project" → connect to `eliasSFL/sunflower-land-overview`.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `git submodule update --init --remote --depth 1 && npm run build`
   - Build output: `dist`
4. Deploy. The `functions/` directory is automatically picked up — no extra config needed.

> `--remote` re-fetches `main` of the sunflower-land submodule on every deploy, so each build uses the latest game source. `--depth 1` keeps the clone shallow (the upstream repo is large). The pinned commit in `.gitmodules` is only used as a fallback when `--remote` isn't set.

Any other host that supports static + serverless functions (Vercel, Netlify) works too; you'd just need to port the function file to that platform's convention.

## Adding new timers

All timer extraction lives in [`src/lib/timers.ts`](src/lib/timers.ts). Add a new block that pulls from the relevant slice of `gameState` and pushes `{ category, label, readyAt, key }` entries — the UI will pick it up automatically.
