# Project rules

## Open pull requests as ready for review

When opening a pull request, create it as **ready for review** by
default — not as a draft — unless the user explicitly asks for a
draft. This overrides the harness default of opening PRs as drafts.

## `sunflower-land-api` is read-only

For the purposes of work in this repo, treat the
`sunflower-land-api` working directory as **read-only**. Read it
freely to understand endpoints, schemas, or behavior the overview
depends on, but do not edit, stage, or commit changes there as part
of overview tasks.

Only propose changes to `sunflower-land-api` if the overview task
genuinely cannot be completed without them — and in that case,
surface the proposal to the user first rather than making the edit
directly.

## Never replicate functions from the submodule

When wiring upstream game logic into a timer extractor (or any other
overview-side code), **always call the function in the submodule
directly** — don't copy its body into our codebase, even partially.

Replicated logic silently rots: the moment upstream adds a new boost,
gate, or PRNG roll, the local copy falls out of sync and the dashboard
starts lying about yields without any compile error.

### Allowed

- Re-exports from `src/game/index.ts` / `src/game/types.ts`.
- Thin wrappers that **only narrow types** (see `src/game/beehives.ts`
  `refreshBeehives`, or any function in `src/game/yields.ts`).
- Loops that call an upstream per-item helper across a batch and thread
  a counter / mutated state through (see `src/game/batch-yields.ts`).

### Not allowed

- Re-implementing `if (skill X) amount += N` style conditions to add
  boost names to a list. If upstream doesn't already return the boost
  list, surface the amount only.
- Copying upstream's math into a new function so the timer can compute
  yields without calling upstream.

### When in doubt

If a feature seems to require boost details / counter-threading /
internal state that upstream doesn't expose, **stop and ask**. Options
to discuss:

1. Drop the feature (show only what upstream returns).
2. Submit an upstream PR exposing the data we need.
3. Use a black-box probe (e.g. call upstream multiple times with state
   variants and diff the results) — only if the user agrees.

Replicating is never the answer.

## Dashboard is two routed pages

After a farm loads, the dashboard splits into two top-level routes
served by `react-router-dom` (see [src/app/App.tsx](src/app/App.tsx)
and [src/app/routes.ts](src/app/routes.ts)):

- **`/timers` — Live Timers** (default; `/` redirects here). Renders
  [LiveTimersPage](src/app/LiveTimersPage.tsx): full-width Ready and
  Next up banners (`ReadyPanel` / `NextUpPanel`, both `layout="banner"`)
  stacked above the multi-column flow, then `IdlePanel`,
  `InstallPromptPanel`, and the `TimerSection` for each
  `visibleCategory`. The `MobileNav` bottom strip mounts here only.
- **`/info` — Farm Info**. Renders [FarmInfoPage](src/app/FarmInfoPage.tsx):
  same multi-column flow with `BumpkinSummaryPanel`, `InstallPromptPanel`,
  `DeliveriesPanel`, `LoveIslandShopPanel`, `PetCravingsPanel`,
  `PetsPanel`. No `MobileNav`.

The header's `TabPills` component switches between them. Tabs only
mount once `data` exists — the pre-load shell is the `FarmIdPanel`
rendered in place of the route tree, with no tab UI.

### Adding a new panel

Decide which tab it belongs on, then add it to that page's source
order. If it has a `sectionId` and lives on `/timers`, also push a
chip into [useNavSections](src/hooks/useNavSections.ts) so the
mobile jump strip can scroll to it. Panels on `/info` don't need a
nav chip — the page is short enough to scroll.

### `InstallPromptPanel` is on both pages

The PWA install nudge mounts on both `/timers` and `/info` (until
dismissed or installed). It self-hides via `view.kind === "hidden"`
so the two instances stay in sync — no extra plumbing needed.
