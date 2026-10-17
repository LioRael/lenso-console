import { defineConfig } from "vite";

import { consoleStylex } from "../../../plugins/console/shell/config/console-stylex.ts";

export default defineConfig({
  root: import.meta.dirname,
  optimizeDeps: {
    include: [
      "@lenso/ui",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
    ],
  },
  plugins: [consoleStylex()],
  server: { host: "127.0.0.1", port: 18442, strictPort: true },
  resolve: { dedupe: ["react", "react-dom"] },
});
