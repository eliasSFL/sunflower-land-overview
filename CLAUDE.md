# Project conventions

## Always import from the submodule, never redefine

The sunflower-land game source is included as a git submodule and wired through TypeScript project references (`tsconfig.sunflower-land.json` builds it with `noCheck`, `tsconfig.app.json` references that project and resolves bare specifiers via `paths`).

**Rule:** any type, constant, or function that exists in the submodule must be imported from it. Do not redefine, narrow, or inline a copy in our codebase.

- Types — re-export from `features/...` through `src/game/index.ts`. If you need a derived alias (`GameState["greenhouse"]`, a union of two upstream unions), define it in `src/game/types.ts` next to the re-exports.
- Constants like `FLOWER_SEEDS`, `FLOWERS`, `KNOWN_IDS`, `DEFAULT_HONEY_PRODUCTION_TIME` — re-export as passthroughs, don't duplicate the values.
- Functions like `getFlowerAmount`, `getCropYieldAmount`, `getCurrentHoneyProduced` — re-export and call upstream. Wrap only when narrowing a signature for typing, never to re-derive the logic.

If something you need isn't exported upstream, ask before adding a local copy. Exporting it from the submodule is usually a one-line change and lives in `sunflower-land/src/...`.

**Why:** when the submodule changes a field name, our compile must break immediately. Local redefs hide upstream changes behind `any` boundaries and surface as runtime bugs.

**The boundary** (enforced by ESLint `no-restricted-imports`): only `src/game/**` and `src/components/sfl-ui/**` may import from bare specifiers that resolve into the submodule (`features/*`, `lib/*`, `components/*`, `metadata/*`, `assets/*`). Everything else goes through `src/game/index.ts`.
