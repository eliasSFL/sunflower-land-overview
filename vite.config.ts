import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const ASSET_STUB = r("./src/game/stubs/asset-stub.ts");
const EXTERNAL_STUB = r("./src/game/stubs/external-stub.ts");

// SFL public asset CDN. The submodule reads this through
// `import.meta.env.VITE_PRIVATE_IMAGE_URL` (lib/config.ts) and threads it
// through `SUNNYSIDE.*` plus `CROP_LIFECYCLE` URL builders. Inlining it
// here as a build-time constant means we don't need a `.env` file and the
// value can't drift between local dev and the deployed Worker.
const SFL_ASSET_CDN = "https://sunflower-land.com/testnet-assets";

export default defineConfig({
  define: {
    "import.meta.env.VITE_PRIVATE_IMAGE_URL": JSON.stringify(SFL_ASSET_CDN),
  },
  plugins: [react(), tailwindcss()],
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
      { find: "web3-utils", replacement: EXTERNAL_STUB },
      { find: "@xstate/react", replacement: EXTERNAL_STUB },
      { find: /^xstate$/, replacement: EXTERNAL_STUB },
      { find: "@react-spring/web", replacement: EXTERNAL_STUB },
      { find: "react-spring", replacement: EXTERNAL_STUB },
      { find: "@headlessui/react", replacement: EXTERNAL_STUB },
      { find: "react-router", replacement: EXTERNAL_STUB },
      { find: "react-router-dom", replacement: EXTERNAL_STUB },
      { find: "mobile-device-detect", replacement: EXTERNAL_STUB },
      { find: "react-i18next", replacement: EXTERNAL_STUB },
      { find: "i18next", replacement: EXTERNAL_STUB },
      { find: "react-hot-toast", replacement: EXTERNAL_STUB },
      { find: "lodash", replacement: EXTERNAL_STUB },
      { find: /^features\/(.*)$/, replacement: r("./sunflower-land/src/features/$1") },
      { find: /^lib\/(.*)$/, replacement: r("./sunflower-land/src/lib/$1") },
      { find: /^components\/(.*)$/, replacement: r("./sunflower-land/src/components/$1") },
      { find: /^metadata\/(.*)$/, replacement: r("./sunflower-land/metadata/$1") },
      // Bare `assets/foo` (no extension) resolves to the submodule's TS
      // module (e.g. assets/sunnyside.ts that exports CDN URL strings).
      // Image-extension matches above already routed to ASSET_STUB first.
      { find: /^assets\/(.*)$/, replacement: r("./sunflower-land/src/assets/$1") },
      { find: /^src\/(.*)$/, replacement: r("./sunflower-land/src/$1") },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      "/api/farms": {
        target: "https://api.sunflower-land.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/farms/, "/community/farms"),
      },
    },
  },
});
