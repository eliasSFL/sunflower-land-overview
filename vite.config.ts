import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { cloudflare } from "@cloudflare/vite-plugin";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    // Order matters: more-specific patterns first.
    //
    //   1. `assets/*` and `src/assets/*` route to the asset stub so image/
    //      audio imports inside the merged game tree don't bloat our bundle
    //      (we render with our own icon set in src/lib/icons.ts).
    //   2. Listed external packages route to a permissive Proxy stub —
    //      the game pulls these in transitively (web3-utils, xstate, react-
    //      spring, etc.) but none of them are executed by yield calculation
    //      paths. Stubbing avoids installing the full deps and shrinks the
    //      bundle.
    //   3. Then the bare-specifier game-tree mappings.
    alias: [
      { find: /^assets\/.*$/, replacement: r("./src/stubs/asset-stub.ts") },
      { find: /^src\/assets\/.*$/, replacement: r("./src/stubs/asset-stub.ts") },
      // External package stubs.
      { find: "web3-utils", replacement: r("./src/stubs/external-stub.ts") },
      { find: "classnames", replacement: r("./src/stubs/external-stub.ts") },
      { find: "@xstate/react", replacement: r("./src/stubs/external-stub.ts") },
      { find: "@react-spring/web", replacement: r("./src/stubs/external-stub.ts") },
      { find: "react-spring", replacement: r("./src/stubs/external-stub.ts") },
      { find: "@headlessui/react", replacement: r("./src/stubs/external-stub.ts") },
      { find: "react-router", replacement: r("./src/stubs/external-stub.ts") },
      { find: "react-router-dom", replacement: r("./src/stubs/external-stub.ts") },
      { find: "mobile-device-detect", replacement: r("./src/stubs/external-stub.ts") },
      { find: "react-i18next", replacement: r("./src/stubs/external-stub.ts") },
      { find: "i18next", replacement: r("./src/stubs/external-stub.ts") },
      { find: "react-hot-toast", replacement: r("./src/stubs/external-stub.ts") },
      { find: "lodash", replacement: r("./src/stubs/external-stub.ts") },
      { find: /^features\/(.*)$/, replacement: r("./sunflower-land/src/features/$1") },
      { find: /^lib\/(.*)$/, replacement: r("./sunflower-land/src/lib/$1") },
      { find: /^components\/(.*)$/, replacement: r("./sunflower-land/src/components/$1") },
      { find: /^metadata\/(.*)$/, replacement: r("./sunflower-land/metadata/$1") },
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
