import { defineConfig, loadEnv, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { cloudflare } from "@cloudflare/vite-plugin";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Image / audio file extensions that the merged game tree imports as
// `import sprite from "assets/foo/bar.png"`. Anything matching is rewritten
// to a CDN URL string by the assetCdn plugin below; anything else (e.g.
// `assets/sunnyside`, `assets/songs/playlist`) falls through the regex
// aliases and resolves to the real .ts source in the submodule.
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|mp4|webm)$/i;

// Routes `import x from "assets/path/to/file.png"` (and the
// `src/assets/...` variant) to a virtual module that exports a CDN URL
// string. This replaces the old asset-stub that returned "" for every
// asset import — ITEM_DETAILS[name].image now points at a real URL the
// browser can load, so we no longer need parallel hand-rolled icon maps in
// src/lib/icons.ts.
function assetCdnPlugin(cdn: string): Plugin {
  const VIRTUAL = "\0virtual:asset-cdn:";
  // Some import paths arrive at this plugin already resolved by Vite's
  // built-in alias to an absolute path under the submodule
  // (e.g. `<repo>/sunflower-land/src/assets/sfts/foo.webp`) — typically
  // the same image imported from a .tsx component file rather than
  // images.ts. Match those too so we never let an asset slip through to
  // the bundler.
  const SUBMODULE_ASSETS_RE = /\/sunflower-land\/src\/assets\/(.*)$/;

  return {
    name: "asset-cdn",
    enforce: "pre",
    resolveId(id) {
      let rel: string | null = null;
      if (id.startsWith("assets/")) rel = id.slice("assets/".length);
      else if (id.startsWith("src/assets/"))
        rel = id.slice("src/assets/".length);
      else {
        const normalised = id.replace(/\\/g, "/");
        const match = normalised.match(SUBMODULE_ASSETS_RE);
        if (match) rel = match[1];
      }
      if (rel === null) return null;
      if (!MEDIA_EXT_RE.test(rel)) return null;
      return VIRTUAL + rel;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null;
      const rel = id.slice(VIRTUAL.length);
      return `export default ${JSON.stringify(`${cdn}/${rel}`)};\n`;
    },
  };
}

export default defineConfig(({ mode }) => {
  // Single source of truth for the CDN host. The assetCdn plugin rewrites
  // bundled asset imports against this; the submodule's CONFIG layer
  // (sunflower-land/src/lib/config.ts) reads the same value at runtime via
  // `import.meta.env.VITE_PRIVATE_IMAGE_URL` to build SUNNYSIDE /
  // CROP_LIFECYCLE template URLs, so we inject it through `define` to
  // guarantee both paths agree even when no .env file is present.
  const env = loadEnv(mode, process.cwd(), "");
  const cdn =
    env.VITE_PRIVATE_IMAGE_URL ?? "https://sunflower-land.com/testnet-assets";

  return {
    plugins: [assetCdnPlugin(cdn), react(), tailwindcss(), cloudflare()],
    define: {
      "import.meta.env.VITE_PRIVATE_IMAGE_URL": JSON.stringify(cdn),
    },
    resolve: {
      // Order matters: more-specific patterns first.
      //
      //   1. Listed external packages route to a permissive Proxy stub —
      //      the game pulls these in transitively (web3-utils, xstate,
      //      react-spring, etc.) but none of them are executed by yield
      //      calculation paths. Stubbing avoids installing the full deps
      //      and shrinks the bundle.
      //   2. Bare-specifier game-tree mappings, including `assets/...` and
      //      `src/assets/...` which point at the submodule's real files.
      //      Image/audio asset imports never reach these aliases — the
      //      assetCdn plugin (enforce: "pre") intercepts them first and
      //      rewrites to CDN URL strings. Code modules under assets/
      //      (e.g. assets/sunnyside.ts) do reach these aliases and load
      //      their real source.
      alias: [
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
        { find: /^assets\/(.*)$/, replacement: r("./sunflower-land/src/assets/$1") },
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
  };
});
