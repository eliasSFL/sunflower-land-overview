# Sunflower Land Overview

A community tool that shows **live timers** for your Sunflower Land farm — crops, fruit, greenhouse, cooking, composters, animals, beehives, deliveries, and bounties — all in one place.

> Not affiliated with Sunflower Land. Data is read from the official public Community API.

## Usage

1. In the game: **Settings → Developer Options → API Key** to generate your key.
2. Open the app, enter your **Farm ID** and **API Key**.
3. Timers refresh automatically every 60 seconds.

Your farm ID and API key are stored in `localStorage` on your device only — they are sent directly to `https://api.sunflower-land.com` from your browser.

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4

## Adding new timers

All timer extraction lives in [`src/lib/timers.ts`](src/lib/timers.ts). Add a new block that pulls from the relevant slice of `gameState` and pushes `{ category, label, readyAt, key }` entries — the UI will pick it up automatically.
