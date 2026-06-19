import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.LENSO_CONSOLE_BASE ?? "/",
  resolve: {
    alias: {
      "@lenso/runtime-console-api": resolve(
        import.meta.dirname,
        "src/extension-host/runtime-console-api.ts"
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
        "extension-host-runtime-console-api": resolve(
          import.meta.dirname,
          "src/extension-host/runtime-console-api.ts"
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
          if (chunkInfo.name === "extension-host-runtime-console-api") {
            return "extensions/host/runtime-console-api.js";
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
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
  },
});
