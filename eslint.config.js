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
    },
  },
  {
    // The yield-prediction service crosses the boundary into the sunflower-
    // land submodule, whose modules are typed as ambient `any` (see
    // src/types/game-modules.d.ts). We deliberately use `any` at the call
    // boundary and re-narrow on the way out — disabling no-explicit-any
    // here keeps the rule strict everywhere else in the overview.
    files: ["src/lib/yields.ts", "src/stubs/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
