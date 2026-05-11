// Post-`git submodule update` patcher.
//
// Why this exists: our composite project (tsconfig.sunflower-land.json)
// emits `.d.ts` for every .ts/.tsx under sunflower-land/src. Some upstream
// files use idioms that fail declaration emit even with `noCheck: true`
// — most notably TS4094 (anonymous classes with private/protected fields
// returned from a factory function). `exclude` doesn't help because the
// files are still pulled in transitively through imports from
// non-excluded files (e.g. features/world/Phaser.tsx imports
// features/community/lib/CommunitySDK).
//
// Strategy: stub the offending file with a minimal export that satisfies
// the importer's signature but eliminates the problematic shape. Nothing
// in our `src/` reaches features/community, so we don't care about its
// runtime behavior — only that consumers in features/world still
// type-check.
//
// Re-running is safe: the script is idempotent (it overwrites with a
// fixed string). It also no-ops if the target file is missing (older
// submodule pins predate it).

import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const targets = [
  {
    path: join(
      repoRoot,
      "sunflower-land/src/features/community/lib/CommunitySDK.ts",
    ),
    // Stub keeps the `prepareAPI` export so importers still resolve, but
    // the returned class has no private/protected members → no TS4094.
    // Functional behavior is irrelevant (nothing we ship uses it).
    content: `// Stubbed by scripts/sanitize-submodule.mjs to avoid TS4094 during
// composite declaration emit. The original upstream file returns an
// anonymous class with private fields, which TS can't emit a .d.ts for.

export function prepareAPI(_args: {
  jwt: string;
  farmId: number;
  gameService: unknown;
}) {
  return class CommunityAPI {
    constructor(_init: { id: string; apiKey: string }) {}
    get game(): unknown {
      return undefined;
    }
    get user() {
      return { farmId: 0 };
    }
    async loadIsland(): Promise<null> {
      return null;
    }
    async saveProgress(_args: { metadata: string }): Promise<{
      updatedAt?: number;
    }> {
      return {};
    }
    async mint(_args: {
      metadata?: string;
      items: Record<string, number>;
      wearables: unknown;
    }): Promise<{ updatedAt?: number }> {
      return {};
    }
    async burn(_args: {
      metadata?: string;
      items: Record<string, number>;
      sfl: number;
    }): Promise<{ updatedAt?: number }> {
      return {};
    }
    async reset(): Promise<void> {}
  };
}
`,
  },
];

let patched = 0;
for (const { path, content } of targets) {
  if (!existsSync(path)) continue;
  const current = readFileSync(path, "utf8");
  if (current === content) continue;
  writeFileSync(path, content);
  patched += 1;
  console.log(`[sanitize-submodule] patched ${path.replace(repoRoot, ".")}`);
}

if (patched === 0) {
  console.log(
    "[sanitize-submodule] nothing to patch (files missing or already stubbed)",
  );
}
