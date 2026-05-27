import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist",
    // The sunflower-land submodule has its own (much laxer) lint config and
    // pulls in deps the overview doesn't carry. We type-check only the
    // files our own code transitively imports — the submodule is otherwise
    // a build-time vendor of the game's harvest functions, not source we
    // own. Excluding it here keeps `npm run lint` honest about overview code.
    "sunflower-land/**",
    // `.wrangler/` holds the local wrangler dev cache (bundled worker
    // artifacts, state db). Already in .gitignore; mirror it here so a
    // stray `wrangler dev` run doesn't poison `npm run lint`.
    ".wrangler/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Underscore-prefixed args mean "intentionally unused" — common when
      // a function has to keep a parameter for signature symmetry.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Boundary enforcement: only src/game/** is allowed to import bare
      // specifiers that resolve into the sunflower-land submodule via Vite
      // aliases. Everything else must go through src/game/ for type-safe
      // re-exports.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "features/*",
            "lib/*",
            "components/*",
            "metadata/*",
            "assets/*",
          ],
        },
      ],
    },
  },
  {
    // The boundary directory itself needs to import these.
    files: ["src/game/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // src/game/ is the only place that crosses the boundary into the
    // sunflower-land submodule. Its modules are typed as ambient `any`
    // (see src/game/game-modules.d.ts). We deliberately use `any` at the
    // call boundary and re-narrow on the way out — disabling no-explicit-
    // any here keeps the rule strict everywhere else in the overview.
    files: ["src/game/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
