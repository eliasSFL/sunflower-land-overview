# Project rules

## Open pull requests as ready for review

When opening a pull request, create it as **ready for review** by
default — not as a draft — unless the user explicitly asks for a
draft. This overrides the harness default of opening PRs as drafts.

## Run PR validation checks before committing to main or opening a PR

Before committing to a main branch (`master` / `development`) or
creating a pull request, run the same checks as
[.github/workflows/pr-validation.yml](.github/workflows/pr-validation.yml),
in this order:

1. `npm run lint`
2. `npm run format:check`
3. `npm test`
4. `npm run build` (typecheck + bundle)

All four must pass. If any fails, fix it (e.g. `npm run format` for
formatting) and re-run before committing or opening the PR — do not
proceed with a red check. Keep this list in sync with the workflow if
its steps change.

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
  stacked above the multi-column flow. The banners are fixed; the column
  flow is the arrangeable panels (Install, Idle, per-category
  `TimerSection`). The `MobileNav` bottom strip mounts here only.
- **`/info` — Farm Info**. Renders [FarmInfoPage](src/app/FarmInfoPage.tsx):
  same multi-column flow with the arrangeable Bumpkin, Village Projects,
  Deliveries, Love Island Shop, Pet Cravings, Pets panels (plus pinned
  Install). No `MobileNav`.

The header's `TabPills` component switches between them. Tabs only
mount once `data` exists — the pre-load shell is the `FarmIdPanel`
rendered in place of the route tree, with no tab UI.

### Panels are arrangeable (drag-to-reorder + hide)

The column-flow panels on each page are **not** hardcoded JSX anymore.
Each page's panels are declared as descriptors in
[panelRegistry.tsx](src/app/panelRegistry.tsx) (`buildTimersPanels` /
`buildInfoPanels`), and App runs [usePanelArrangement](src/hooks/usePanelArrangement.ts)
per page to resolve the player's saved order + hidden set against the
live panel list. The pages just render the resolved `renderPanels`.
Players reorder/hide via the **Arrange panels** sheet
([ArrangePanelsSheet](src/components/ArrangePanelsSheet.tsx), opened from
Settings), persisted with the **no-TTL** [prefs.ts](src/lib/prefs.ts)
store — do NOT use `storage.ts` for prefs, its 7-day TTL would reset
layouts. Pure reconcile logic lives in
[panelOrder.ts](src/app/panelOrder.ts) (tested in `panelOrder.test.ts`).

### Adding a new panel

Decide which tab it belongs on, then add a descriptor to that page's
builder in [panelRegistry.tsx](src/app/panelRegistry.tsx) at the desired
default position. Give it a stable `id` (reuse the panel's `sectionId`
constant where it stamps a single DOM id, so the jump-nav and
arrangement share one id space), a `label`, and an `icon`. Mark it
`pinned: true` only if it must never be reordered/hidden (like Install).
If it lives on `/timers` and has a `sectionId`, also push a chip into
[useNavSections](src/hooks/useNavSections.ts) so the mobile jump strip
can scroll to it (set `panelId` on the chip if several chips map to one
panel, as Deliveries does). Hiding is automatic — a hidden panel's DOM
id is absent, so `NavMenu` drops its chip with no extra work. Panels on
`/info` get their chip from
[useFarmInfoNavSections](src/hooks/useFarmInfoNavSections.ts).

### `InstallPromptPanel` is on both pages

The PWA install nudge mounts on both `/timers` and `/info` (until
dismissed or installed). It self-hides via `view.kind === "hidden"`
so the two instances stay in sync — no extra plumbing needed.
