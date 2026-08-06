import path from "node:path";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { consoleStylex } from "./config/console-stylex.ts";
import { consoleDevPlugin } from "./src/dev/console-dev-vite-plugin.ts";

const consoleDevMiddleware = consoleDevPlugin({
  diagnosticsFile: process.env.LENSO_CONSOLE_DEV_DIAGNOSTICS_FILE,
  hostUrl: process.env.LENSO_CONSOLE_DEV_HOST,
});

const isVitest = process.env.VITEST === "true";
const startPlugin = isVitest
  ? []
  : [
      tanstackStart({
        spa: {
          enabled: true,
          prerender: {
            crawlLinks: false,
            outputPath: "/index.html",
            retryCount: 0,
          },
        },
      }),
    ];
const devPlugin = isVitest ? [] : [consoleDevMiddleware];

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      "@lenso/console-module-api": path.resolve(
        import.meta.dirname,
        "packages/console-module-api/src/index.ts"
      ),
      "@lenso/console-ui": path.resolve(
        import.meta.dirname,
        "packages/console-ui/src/index.tsx"
      ),
      "@lenso/console-tokens/tokens.stylex": path.resolve(
        import.meta.dirname,
        "packages/console-tokens/src/tokens.stylex.ts"
      ),
      "@lenso/console-tokens": path.resolve(
        import.meta.dirname,
        "packages/console-tokens/src/index.ts"
      ),
      "@lenso/console-composition-api": path.resolve(
        import.meta.dirname,
        "packages/console-composition-api/src/index.ts"
      ),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")) {
            return "react";
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
  plugins: [...startPlugin, react(), consoleStylex(), ...devPlugin],
  server: {
    port: 5174,
  },
});
