import { defineConfig, loadEnv } from "vite";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Build-time git metadata. Falls back to an empty string if `git`
// fails (e.g. running outside a repo) so the UI can hide the link
// gracefully.
const gitCommit = (() => {
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
})();
const GITHUB_REPO = "eliasSFL/sunflower-land-overview";

// Header chip shows the latest git tag on prod (Workers Builds for the
// master branch), short commit SHA everywhere else — dev branch
// deploys and local builds. WORKERS_CI_BRANCH is set by Cloudflare
// Workers Builds; missing locally, so the SHA fallback kicks in. The
// CI build command runs `git fetch --tags` first because Workers
// Builds checkouts are shallow and would otherwise miss the tag.
const gitTag = (() => {
  try {
    return execSync("git describe --tags --abbrev=0", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
})();
const shortSha = gitCommit.slice(0, 7);
const appVersion =
  process.env.WORKERS_CI_BRANCH === "master" && gitTag ? gitTag : shortSha;

// Non-master Workers Builds deploy to the `sunflower-land-overview-dev`
// environment (see wrangler.jsonc `env.development`). Local builds —
// no WORKERS_CI_BRANCH — also get the "(Dev)" suffix so installed PWAs
// and tab titles stay distinguishable when testing locally. Only the
// master deploy uses the clean production name.
const IS_PROD_DEPLOY = process.env.WORKERS_CI_BRANCH === "master";
const APP_NAME = IS_PROD_DEPLOY
  ? "Sunflower Land Overview"
  : "Sunflower Land Overview (Dev)";
const APP_SHORT_NAME = IS_PROD_DEPLOY
  ? "SFL Overview"
  : "SFL Overview (Dev)";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const ASSET_STUB = r("./src/game/stubs/asset-stub.ts");
const EXTERNAL_STUB = r("./src/game/stubs/external-stub.ts");

// SFL public asset CDN + network. The submodule reads both through
// `import.meta.env.*` (lib/config.ts) and threads them through
// `SUNNYSIDE.*`, `CROP_LIFECYCLE`, and `getBudImage` URL builders.
//
// Read from `.env` (copy from `.env.example`) with mainnet defaults as
// the fallback so the build still works without one. Values match
// upstream's `.github/workflows/mainnet.yml`.
const DEFAULT_ASSET_CDN = "https://sunflower-land.com/game-assets";
const DEFAULT_NETWORK = "mainnet";
// Bumpkin animation CDN — drives `getAnimatedWebpUrl` for NPC avatars.
// Mainnet value matches upstream's `.github/workflows/mainnet.yml`.
const DEFAULT_ANIMATION_URL = "https://animations.sunflower-land.com";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const SFL_ASSET_CDN = env.VITE_PRIVATE_IMAGE_URL || DEFAULT_ASSET_CDN;
  const SFL_NETWORK = env.VITE_NETWORK || DEFAULT_NETWORK;
  const SFL_ANIMATION_URL = env.VITE_ANIMATION_URL || DEFAULT_ANIMATION_URL;

  return {
    define: {
      "import.meta.env.VITE_PRIVATE_IMAGE_URL": JSON.stringify(SFL_ASSET_CDN),
      "import.meta.env.VITE_NETWORK": JSON.stringify(SFL_NETWORK),
      "import.meta.env.VITE_ANIMATION_URL": JSON.stringify(SFL_ANIMATION_URL),
      "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(gitCommit),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
      "import.meta.env.VITE_GITHUB_REPO": JSON.stringify(GITHUB_REPO),
      "import.meta.env.VITE_APP_NAME": JSON.stringify(APP_NAME),
      "import.meta.env.VITE_APP_SHORT_NAME": JSON.stringify(APP_SHORT_NAME),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Emits /version.json so the running client can poll the
      // deployed hash and prompt to refresh when it drifts from the
      // bundle's own VITE_COMMIT_SHA. In dev we serve the same payload
      // from middleware so the prompt logic exercises end-to-end.
      {
        name: "sfl-overview:version-json",
        configureServer(server) {
          server.middlewares.use("/version.json", (_req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ commit: gitCommit }));
          });
        },
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ commit: gitCommit }),
          });
        },
        // Substitute %APP_NAME% in index.html so the browser tab title
        // reflects the dev/prod branch. Vite's built-in %VITE_*%
        // replacement only reads .env files, not `define`, so we apply
        // it here ourselves.
        transformIndexHtml(html) {
          return html.replaceAll("%APP_NAME%", APP_NAME);
        },
      },
      VitePWA({
        registerType: "autoUpdate",
        // We own the service worker source (src/sw.ts) so we can add
        // `push` + `notificationclick` handlers for Web Push. Workbox
        // primitives (precacheAndRoute, NavigationRoute) are still
        // imported there, mirroring generateSW behaviour.
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectManifest: {
          // The submodule pulls everything into one ~12 MB chunk;
          // Workbox's 2 MiB default would silently skip precaching it
          // and break offline shell loads. Revisit if/when we add
          // code-splitting.
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        },
        includeAssets: ["favicon.webp", "icons/sfl_overview-180.webp"],
        manifest: {
          name: APP_NAME,
          short_name: APP_SHORT_NAME,
          description:
            "Live timers for your Sunflower Land farm — crops, animals, cooking, composters, deliveries and more.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#181425",
          theme_color: "#181425",
          icons: [
            {
              src: "/icons/sfl_overview-192.webp",
              sizes: "192x192",
              type: "image/webp",
            },
            {
              src: "/icons/sfl_overview-512.webp",
              sizes: "512x512",
              type: "image/webp",
            },
            {
              src: "/icons/sfl_overview-maskable-512.webp",
              sizes: "512x512",
              type: "image/webp",
              purpose: "maskable",
            },
          ],
        },
        // `workbox` (generateSW) replaced by our own src/sw.ts under
        // `injectManifest` — Workbox primitives there register the
        // same navigation fallback + denylist.
      }),
    ],
    resolve: {
      // Order matters: more-specific patterns first.
      //
      //   1. Audio + font extensions still route to the asset stub — we
      //      never play sound and the chrome fonts are loaded via @font-face
      //      in src/index.css, so bundling these would just bloat dist/.
      //   2. Image extensions fall through to the bare `assets/*` mapping
      //      below, so Vite resolves and emits real files. This makes
      //      ITEM_DETAILS[name].image work for every item the submodule
      //      defines (fruits, resources, decorations, NFTs) without needing
      //      a per-category override map.
      //   3. Listed external packages route to a permissive Proxy stub — the
      //      game pulls these in transitively but none are executed by the
      //      pure yield-calculation paths we import.
      alias: [
        {
          find: /^assets\/.*\.(mp3|wav|ogg|otf|ttf|woff2?)$/,
          replacement: ASSET_STUB,
        },
        {
          find: /^src\/assets\/.*\.(mp3|wav|ogg|otf|ttf|woff2?)$/,
          replacement: ASSET_STUB,
        },
        // Howler-using sound hook in the submodule — replace with our no-op
        // so we don't pull howler into the bundle.
        {
          find: /^lib\/utils\/hooks\/useSound$/,
          replacement: r("./src/game/stubs/useSound-stub.ts"),
        },
        // Upstream `features/community/lib/CommunitySDK.ts` returns an
        // anonymous class with private fields from `prepareAPI`, which
        // trips TS4094 during composite .d.ts emit. We never invoke it,
        // but features/world/Phaser.tsx imports it, so resolution still
        // happens. Redirect to a local stub with the same export shape —
        // the submodule file is never read. See src/game/stubs/
        // community-sdk-stub.ts for the long explanation.
        {
          find: /^features\/community\/lib\/CommunitySDK$/,
          replacement: r("./src/game/stubs/community-sdk-stub.ts"),
        },
        { find: "react-i18next", replacement: EXTERNAL_STUB },
        { find: "i18next", replacement: EXTERNAL_STUB },
        { find: "lodash", replacement: EXTERNAL_STUB },
        { find: "gameanalytics", replacement: EXTERNAL_STUB },
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
        // Bare `assets/foo` (no extension) resolves to the submodule's TS
        // module (e.g. assets/sunnyside.ts that exports CDN URL strings).
        // Image-extension matches above already routed to ASSET_STUB first.
        {
          find: /^assets\/(.*)$/,
          replacement: r("./sunflower-land/src/assets/$1"),
        },
        { find: /^src\/(.*)$/, replacement: r("./sunflower-land/src/$1") },
      ],
    },
    server: {
      port: 3000,
      // Forward Worker-served routes to a locally-running `wrangler dev`
      // on :8787. Run both in parallel:
      //   terminal 1:  npx wrangler dev
      //   terminal 2:  npm run dev
      // The Worker mints its own community key from SFL_COMMUNITY_API_KEY
      // (see .dev.vars), so the SPA never sends an x-api-key header.
      proxy: {
        "/api/farms": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
        "/push": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },
  };
});
