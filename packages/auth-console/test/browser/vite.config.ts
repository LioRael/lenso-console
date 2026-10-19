import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { consoleStylex } from "../../../../plugins/console/shell/config/console-stylex.js";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: source("../../../../"),
  plugins: [react(), consoleStylex()],
  resolve: {
    conditions: ["lenso-source"],
    alias: [
      {
        find: "@lenso/tokens/styles.css",
        replacement: createRequire(
          new URL("../../../console-react/package.json", import.meta.url)
        ).resolve("@lenso/tokens/styles.css"),
      },
      {
        find: /^@lenso\/console-react$/,
        replacement: source("../../../console-react/dist/index.js"),
      },
      {
        find: /^@lenso\/console-react\/styles\.css$/,
        replacement: source("../../../console-react/dist/styles.css"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: { include: ["@lenso/ui", "@lenso/ui/**"] },
  server: { host: "127.0.0.1", port: 54384, strictPort: true },
});
