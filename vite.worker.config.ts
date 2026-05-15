import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const ASSET_STUB = r("./src/game/stubs/asset-stub.ts");
const EXTERNAL_STUB = r("./src/game/stubs/external-stub.ts");

// Worker build target. Reuses the same submodule path aliases the SPA
// uses (see vite.config.ts) so worker/* can import from src/timers/*
// and let extraction run server-side without replicating any
// submodule logic. Output is a single ESM file that wrangler deploys
// directly (wrangler.jsonc's `main` points here).
export default defineConfig({
  define: {
    "import.meta.env.VITE_NETWORK": JSON.stringify("mainnet"),
    "import.meta.env.VITE_PRIVATE_IMAGE_URL": JSON.stringify(""),
    "import.meta.env.VITE_ANIMATION_URL": JSON.stringify(""),
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(""),
    "import.meta.env.VITE_GITHUB_REPO": JSON.stringify(""),
    // Forces CONFIG.PORTAL_APP to a truthy value so the submodule's
    // `features/game/types/chapters.ts:getCurrentChapter` returns the
    // hardcoded "Salt Awakening" fallback instead of throwing
    // "No Chapter found" when Cloudflare's deploy-time validation
    // happens to run outside any defined chapter window. The DO's
    // pure-data paths never use the chapter info downstream.
    "import.meta.env.VITE_PORTAL_APP": JSON.stringify("1"),
  },
  resolve: {
    alias: [
      {
        find: /^assets\/.*\.(mp3|wav|ogg|otf|ttf|woff2?|png|webp|gif|jpg|jpeg|svg)$/,
        replacement: ASSET_STUB,
      },
      {
        find: /^src\/assets\/.*\.(mp3|wav|ogg|otf|ttf|woff2?|png|webp|gif|jpg|jpeg|svg)$/,
        replacement: ASSET_STUB,
      },
      {
        find: /^lib\/utils\/hooks\/useSound$/,
        replacement: r("./src/game/stubs/useSound-stub.ts"),
      },
      {
        find: /^features\/community\/lib\/CommunitySDK$/,
        replacement: r("./src/game/stubs/community-sdk-stub.ts"),
      },
      // The submodule's i18n init module touches localStorage at
      // module-load time (lib/i18n/index.ts). The Worker bundle pulls
      // it in transitively via the timer extractor; localStorage
      // doesn't exist in the Workers runtime, so the bundle crashes
      // on boot. Stub the module out — no `t()` call from the
      // extractor's pure-data paths actually needs a real translation.
      {
        find: /^lib\/i18n(\/.*)?$/,
        replacement: EXTERNAL_STUB,
      },
      { find: "react-i18next", replacement: EXTERNAL_STUB },
      { find: "i18next", replacement: EXTERNAL_STUB },
      { find: "lodash", replacement: EXTERNAL_STUB },
      { find: "gameanalytics", replacement: EXTERNAL_STUB },
      // `react` itself stays real — react core is DOM-free and the
      // submodule's pure helpers `import` hooks they never call. Only
      // react-dom is stubbed (huge, never executed in a Worker).
      { find: "react-dom", replacement: EXTERNAL_STUB },
      { find: "react-dom/client", replacement: EXTERNAL_STUB },
      {
        find: /^features\/(.*)$/,
        replacement: r("./sunflower-land/src/features/$1"),
      },
      { find: /^lib\/(.*)$/, replacement: r("./sunflower-land/src/lib/$1") },
      {
        find: /^components\/(.*)$/,
        replacement: r("./sunflower-land/src/components/$1"),
      },
      {
        find: /^metadata\/(.*)$/,
        replacement: r("./sunflower-land/metadata/$1"),
      },
      {
        find: /^assets\/(.*)$/,
        replacement: r("./sunflower-land/src/assets/$1"),
      },
      { find: /^src\/(.*)$/, replacement: r("./sunflower-land/src/$1") },
    ],
  },
  build: {
    target: "es2022",
    outDir: "dist-worker",
    emptyOutDir: true,
    minify: true,
    ssr: true,
    rollupOptions: {
      input: r("./worker/index.ts"),
      output: {
        format: "esm",
        entryFileNames: "index.js",
        // Wrangler expects a single ESM file as `main`. The dynamic
        // imports the submodule pulls in are all dead at runtime for
        // the pure-data paths we use, but rolldown still tries to
        // code-split them — force a single chunk.
        inlineDynamicImports: true,
      },
    },
  },
});
