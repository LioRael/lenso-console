import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { consoleDevPlugin } from "./src/dev/console-dev-vite-plugin";

const consoleDevMiddleware = consoleDevPlugin({
  diagnosticsFile: process.env.LENSO_CONSOLE_DEV_DIAGNOSTICS_FILE,
  hostUrl: process.env.LENSO_CONSOLE_DEV_HOST,
});

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      "@lenso/console-module-api": resolve(
        import.meta.dirname,
        "packages/console-module-api/src/index.ts"
      ),
      "@lenso/console-ui": resolve(
        import.meta.dirname,
        "packages/console-ui/src/index.tsx"
      ),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          if (id.includes("node_modules/react")) {
            return "react";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "tanstack";
          }
          if (id.includes("node_modules/gsap")) {
            return "gsap";
          }
          if (
            id.includes("node_modules/@base-ui") ||
            id.includes("node_modules/lucide-react") ||
            id.includes("node_modules/ky")
          ) {
            return "ui-vendor";
          }
        },
      },
    },
  },
  plugins: [react(), tailwindcss(), consoleDevMiddleware],
  server: {
    port: 5174,
  },
});
