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

## Push `sunflower-land` submodule branches to upstream, not a fork

When an overview task needs a change in the `sunflower-land` game
submodule (e.g. extracting a helper so we can call it instead of
replicating — see above), push the branch to the **upstream repo**
(`origin` → `sunflower-land/sunflower-land`) and open the PR from
there. The maintainer has write access to upstream, so do **not** push
to a personal fork (`eliasSFL/sunflower-land`) — a fork + cross-repo PR
only adds friction, and leaves the overview pinning a fork-only commit
SHA that CI can't resolve until the PR merges.

```sh
git -C sunflower-land push origin <branch>
gh pr create --repo sunflower-land/sunflower-land --base main --head <branch>
```

Opening the PR is still an outward-facing action — confirm with the
user first unless they've already said to proceed.

By default, do **not** bump the overview's submodule pointer to pick up
the merge yourself. A scheduled
[bot](.github/workflows/bump-sunflower-land-submodule.yml) advances the
SHA, and a manual pointer bump in a feature PR conflicts with its next
run and forces a coordination round (see CONTRIBUTING.md → "Submodule
pointer changes"). Only include a pointer bump when the user has
explicitly approved/coordinated it for that feature — otherwise let the
bot carry the new SHA, and hold the dependent overview change until it
has.

## Dashboard is five routed pages (the "action" scheme)

After a farm loads, the dashboard splits into five top-level routes
served by `react-router-dom` (see [src/app/App.tsx](src/app/App.tsx)
and [src/app/routes.ts](src/app/routes.ts)), organised by **what you're
doing** rather than timers-vs-info:

- **`/now` — Now** (default; `/` and unknown paths redirect here).
  Renders [NowPage](src/app/NowPage.tsx): a bespoke (non-arrangeable)
  stack — `CollectNowPanel` (every ready item across the whole farm,
  grouped by category), `NowTimelinePanel` (a next-4h horizontal
  timeline), and the existing `IdlePanel` (wasted-capacity nudge). Each
  self-hides when empty. No `NavMenu`.
- **`/producing` — Producing**. Arrangeable multi-column flow of the
  per-category `TimerSection`s (Install pinned first). "What's
  mid-timer." Ready-now aggregation lives on `/now`, not here.
- **`/quests` — Quests**. Arrangeable flow: Deliveries, Chores,
  Bounties, Animal Bounties (plus pinned Install). "What you owe."
- **`/digging` — Digging**. The bespoke Digby's dig-site board (see
  [DiggingPage](src/app/DiggingPage.tsx)). No arrangeable flow.
- **`/farm` — Farm**. Arrangeable flow: Bumpkin, Village Projects, Love
  Island Shop, Pet Cravings, Pets (plus pinned Install). "Your standing."

The three arrangeable pages (Producing, Quests, Farm) render through the
generic [PanelGridPage](src/app/PanelGridPage.tsx); Now and Digging are
bespoke. The **`PageNavMenu`** FAB (bottom-right HUD) switches routes on
every breakpoint. Pages only mount once `data` exists — the pre-load
shell is the `FarmIdPanel` rendered in place of the route tree. The old
`/timers` and `/info` paths redirect to `/producing` and `/farm`.

### Panels are arrangeable (drag-to-reorder + hide)

The column-flow panels on each arrangeable page are **not** hardcoded
JSX. Each page's panels are declared as descriptors in
[panelRegistry.tsx](src/app/panelRegistry.tsx) (`buildProducingPanels` /
`buildQuestsPanels` / `buildFarmPanels`), and App runs
[usePanelArrangement](src/hooks/usePanelArrangement.ts) per page
(keys `producing` / `quests` / `farm`) to resolve the player's saved
order + hidden set against the live panel list. The pages just render
the resolved `renderPanels`. Players reorder/hide via the **Arrange
panels** sheet ([ArrangePanelsSheet](src/components/ArrangePanelsSheet.tsx),
opened from Settings), persisted with the **no-TTL**
[prefs.ts](src/lib/prefs.ts) store — do NOT use `storage.ts` for prefs,
its 7-day TTL would reset layouts. Pure reconcile logic lives in
[panelOrder.ts](src/app/panelOrder.ts) (tested in `panelOrder.test.ts`).
Bespoke pages (Now, Digging) have no arrangement and hand the Settings →
Layout screen a neutral, no-op sheet.

### Adding a new panel

Decide which page it belongs on, then add a descriptor to that page's
builder in [panelRegistry.tsx](src/app/panelRegistry.tsx) at the desired
default position. Give it a stable `id` (reuse the panel's `sectionId`
constant where it stamps a single DOM id, so the jump-nav and
arrangement share one id space), a `label`, and an `icon`. Mark it
`pinned: true` only if it must never be reordered/hidden (like Install).
If it has a `sectionId`, also push a chip into that page's nav hook —
[useNavSections](src/hooks/useNavSections.ts) (Producing),
[useQuestsNavSections](src/hooks/useQuestsNavSections.ts), or
[useFarmNavSections](src/hooks/useFarmNavSections.ts) — so the mobile
jump strip can scroll to it (set `panelId` on the chip if several chips
map to one panel, as Deliveries does). Hiding is automatic — a hidden
panel's DOM id is absent, so `NavMenu` drops its chip with no extra work.

### `InstallPromptPanel` is on every arrangeable page

The PWA install nudge mounts (pinned first) on `/producing`, `/quests`,
and `/farm` until dismissed or installed. It self-hides via
`view.kind === "hidden"` so the instances stay in sync — no extra
plumbing needed.
