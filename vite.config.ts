import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
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
