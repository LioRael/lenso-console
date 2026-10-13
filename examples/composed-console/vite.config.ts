import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { consoleStylex } from "../../plugins/console/shell/config/console-stylex.ts";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: source("./"),
  plugins: [react(), consoleStylex()],
  resolve: {
    conditions: ["lenso-source"],
    alias: [
      {
        find: /^@lenso\/console-react$/,
        replacement: source("../../packages/console-react/dist/index.js"),
      },
      {
        find: "@lenso/auth-console/react",
        replacement: source("../../packages/auth-console/src/react.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "@lenso/ui",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
      "react-grid-layout",
      "react-resizable",
    ],
  },
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
  build: { outDir: "dist", cssCodeSplit: false },
});
