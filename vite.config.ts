import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { consoleDevPlugin } from "./src/dev/console-dev-vite-plugin";

const consoleDevMiddleware = consoleDevPlugin({
  diagnosticsFile: process.env.LENSO_CONSOLE_DEV_DIAGNOSTICS_FILE,
  extensionsDir: process.env.LENSO_CONSOLE_DEV_EXTENSIONS_DIR,
  hostUrl: process.env.LENSO_CONSOLE_DEV_HOST,
  registryFile: process.env.LENSO_CONSOLE_DEV_REGISTRY_FILE,
});

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      "@lenso/console-package-api": resolve(
        import.meta.dirname,
        "src/extension-host/console-package-api.ts"
      ),
    },
  },
  build: {
    rolldownOptions: {
      input: {
        app: resolve(import.meta.dirname, "index.html"),
        "extension-host-react": resolve(
          import.meta.dirname,
          "src/extension-host/react.ts"
        ),
        "extension-host-react-jsx-runtime": resolve(
          import.meta.dirname,
          "src/extension-host/react-jsx-runtime.ts"
        ),
        "extension-host-console-package-api": resolve(
          import.meta.dirname,
          "src/extension-host/console-package-api.ts"
        ),
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === "extension-host-react") {
            return "extensions/host/react.js";
          }
          if (chunkInfo.name === "extension-host-react-jsx-runtime") {
            return "extensions/host/react-jsx-runtime.js";
          }
          if (chunkInfo.name === "extension-host-console-package-api") {
            return "extensions/host/console-package-api.js";
          }
          return "assets/[name]-[hash].js";
        },
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
