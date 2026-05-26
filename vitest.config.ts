import { defineConfig } from "vitest/config";

// Vitest is intentionally configured stand-alone instead of as a `test`
// block on vite.config.ts:
//   * The client config wires up the PWA plugin, the version-json
//     middleware, and an asset-resolution table that points into the
//     `sunflower-land` submodule. None of that needs to run for unit
//     tests of pure timer extractors, and loading it would tangle the
//     test boot path with the full client bundle pipeline.
//   * Tests mock `../game/index.ts` directly (via `vi.mock`), so the
//     submodule aliases aren't needed at runtime. If a future test
//     wants to exercise the real upstream helpers, copy the relevant
//     `resolve.alias` entries from vite.config.ts into the `resolve`
//     block below — don't import vite.config.ts here.
export default defineConfig({
  test: {
    environment: "node",
    // Scope discovery so we don't accidentally pick up tests inside the
    // submodule (`sunflower-land/...`) or stale worktrees
    // (`.claude/worktrees/...`). `node_modules` is excluded by Vitest
    // out of the box.
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    exclude: ["node_modules", "sunflower-land", ".claude", "dist"],
  },
});
