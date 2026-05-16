# Contributing to Sunflower Land Overview

Thanks for thinking about contributing! This is a small community tool for
Sunflower Land players, and PRs from the community are welcome.

## What's in scope

- **Bug fixes** of any size — typos, regressions, broken timers, layout
  glitches.
- **Performance improvements** to the timer extractors, the Worker, or the
  SPA.
- **New features that fit the dashboard vision** — more timer categories,
  better notifications, UX polish, accessibility improvements.
- **Documentation** improvements to the README, this file, or inline help.

## What's out of scope

- **Anything that replaces or wraps the game itself.** This is a read-only
  viewer. Account management, asset listing, marketplace integration, bot
  automation, and similar belong in their own projects.
- **Re-implementing upstream game logic.** See "Never replicate functions
  from the submodule" below — this is the single most important rule.
- **Full visual redesigns.** Small UX tweaks and polish are great; an
  end-to-end restyle is best raised as an issue first.
- **i18n / translation infrastructure** unless we've agreed on a framework
  first.

## Using the upstream submodule

The `sunflower-land/` submodule is the source of truth for game
mechanics. All imports from it go through our wrapper layer in
`src/game/`:

- Type re-exports live in `src/game/index.ts` and `src/game/types.ts`.
- Yield calculators in `src/game/yields.ts` wrap upstream's per-item
  functions with type narrowing.
- Batch operations in `src/game/batch-yields.ts` call those wrappers
  across a collection and thread mutated state through.

Don't import from `sunflower-land/src/...` directly in feature code. If
you need a function that isn't already wrapped, add the wrapper to
`src/game/` first, then use it from your feature. This keeps the
"never replicate" rule (below) enforceable: if every upstream call
goes through one layer, we can audit that layer for replicated logic.

## Never replicate functions from the submodule

This is the project's core rule. Yields, boosts, timers — anything
game-mechanical — must be computed by **calling functions from the
`sunflower-land/` submodule directly**, never by copying them into this
repo. Even partial copies silently rot the moment upstream adds a new
boost, gate, or PRNG roll, and the dashboard starts lying without any
compile error.

**Allowed:**

- Re-exports from `src/game/index.ts` / `src/game/types.ts`.
- Thin wrappers that only narrow types (see `src/game/beehives.ts`
  `refreshBeehives`, or any function in `src/game/yields.ts`).
- Loops that call an upstream per-item helper across a batch and thread
  a counter / mutated state through (see `src/game/batch-yields.ts`).

**Not allowed:**

- Re-implementing `if (skill X) amount += N` style conditions in our code.
- Copying upstream math into a new function so the timer can compute
  yields without calling upstream.

If a feature seems to require boost details, counter-threading, or internal
state that upstream doesn't expose, **open an issue first** to discuss.
Options are usually:

1. Drop the feature (show only what upstream returns).
2. Submit an upstream PR exposing the data we need.
3. Use a black-box probe (call upstream multiple times with state variants
   and diff the results) — only if the maintainer agrees.

Replicating is never the answer.

### Submodule pointer changes

The `sunflower-land/` submodule SHA is bumped daily by an
[automated workflow](.github/workflows/bump-sunflower-land-submodule.yml).
Please don't include a submodule-pointer change in your PR — it conflicts
with the bot's next run and forces a coordination round. If your change
genuinely needs an upstream version the bot hasn't reached yet, open an
issue.

## Getting set up

See [the README](README.md#run-locally) for the full local-dev setup,
including the Cloudflare Worker. For UI-only work the SPA alone is
enough:

```sh
git clone --recurse-submodules https://github.com/eliasSFL/sunflower-land-overview.git
cd sunflower-land-overview
npm install
npm run dev     # Vite SPA on http://localhost:3000
```

### Worker development

The Cloudflare Worker (`src/api/`, run with `npm run wrangler`) handles
authentication and mints per-farm Community API keys from a
`MASTER_SECRET` env var. That secret isn't shareable, so:

- **UI-only changes** — the SPA (`npm run dev`) works standalone. You
  can develop most features without touching the Worker.
- **Worker changes** — open an issue describing what you want to change.
  The maintainer can run your branch against a local secret or help you
  set up your own Cloudflare account + Community API access.

## Before you open a PR

Issues are **optional** — for small fixes, just open the PR. For larger
work (new features, refactors, anything that touches the timer extractors
or the Worker), opening an issue first will save you wasted effort if it
turns out to be out of scope.

Run the same checks CI will run:

```sh
npm run lint
npm run format:check
npm run build
```

If any of these fail locally, the
[PR validation workflow](.github/workflows/pr-validation.yml) will fail
too, and the PR can't be merged.

### Tests

There's no test framework wired into the repo today, so tests aren't
required for your PR to land. If you think your change would benefit
from one — especially for the timer extractors in `src/timers/` or the
game bridge in `src/game/` — please open an issue first so we can pick
a framework together rather than ending up with two.

## PR conventions

- **One topic per PR.** Bundle unrelated changes separately — easier to
  review, easier to revert.
- **Squash merges.** PRs are squashed into a single commit on `master`, so
  don't worry about cleaning up your branch's commit history. Focus on a
  clear PR title and description.
- **Reference the issue** with `Closes #N` in the PR description when one
  exists.
- **Update docs** if you change user-facing behaviour.

## AI-assisted contributions

PRs written with help from AI tools (Claude, Copilot, etc.) are
welcome. The maintainer uses them too. The expectations are:

- **You understand every line of the diff.** If a reviewer asks "why
  this approach?", you can answer without re-prompting the model.
- **You've actually run the code locally.** AI tools sometimes generate
  plausible-looking nonsense; lint, format-check, and a clean build are
  the baseline, but please also exercise the feature in the browser.
- **You followed the "never replicate from submodule" rule.** AI
  assistants are particularly prone to suggesting "I'll just inline
  this calculation" — don't.

Disclosure isn't required, but a quick note in the PR description helps
reviewers gauge how deep to look.

## Security issues

Please **do not** open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for the private reporting process.

## Where to ask questions

- **GitHub issues** — bug reports, feature requests, anything you want
  recorded and searchable.
- **Sunflower Land Discord** — casual chat, design questions, "is this
  idea worth a PR?". Join at <https://discord.gg/sunflowerland>

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).
By participating, you agree to abide by its terms. Report unacceptable
behaviour privately to elias@sunflower-land.com.

## Licensing of your contributions

By submitting a contribution, you agree that your work is licensed under
the [MIT License](LICENSE), the same license that covers the rest of this
repository.
