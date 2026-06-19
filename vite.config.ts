import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.LENSO_CONSOLE_BASE ?? "/",
  build: {
    rolldownOptions: {
      input: {
        app: resolve(import.meta.dirname, "index.html"),
        "auth-console": resolve(
          import.meta.dirname,
          "src/auth-console-extension-entry.ts"
        ),
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames(chunkInfo) {
          return chunkInfo.name === "auth-console"
            ? "extensions/auth/auth-console.js"
            : "assets/[name]-[hash].js";
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
