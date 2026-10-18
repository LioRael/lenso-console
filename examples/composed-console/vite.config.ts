import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { consoleStylex } from "../../plugins/console/shell/config/console-stylex.ts";
import { agentReplayPlugin } from "./agent-replay.ts";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: source("./"),
  plugins: [react(), consoleStylex(), agentReplayPlugin()],
  resolve: {
    conditions: ["lenso-source"],
    alias: [
      {
        find: /^@lenso\/console-react$/,
        replacement: source("../../packages/console-react/dist/index.js"),
      },
      {
        // Pair extracted CSS with compiled JS despite source conditions elsewhere.
        find: /^@lenso\/console-react\/styles\.css$/,
        replacement: source("../../packages/console-react/dist/styles.css"),
      },
      {
        find: "@lenso/auth-console/react",
        replacement: source("../../packages/auth-console/src/react.ts"),
      },
      {
        find: "@lenso/auth-console/administration/react",
        replacement: source(
          "../../packages/auth-console/src/administration-react.ts"
        ),
      },
      {
        find: "@lenso/auth-console/oauth/react",
        replacement: source("../../packages/auth-console/src/oauth-react.tsx"),
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
  build: {
    outDir: "dist",
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep CommonJS grid initializers with their dependency closure.
          includeDependenciesRecursively: true,
          groups: [
            {
              name: "react",
              test: /[/\\]node_modules[/\\](?:react|react-dom|scheduler)[/\\]/u,
            },
            { name: "ui", test: /[/\\]node_modules[/\\]@lenso[/\\]ui[/\\]/u },
            {
              name: "motion",
              test: /[/\\]node_modules[/\\](?:motion|motion-dom|motion-utils|framer-motion)[/\\]/u,
            },
            {
              name: "grid",
              test: /[/\\]node_modules[/\\](?:react-grid-layout|react-resizable|react-draggable)[/\\]/u,
            },
          ],
        },
      },
    },
  },
});
