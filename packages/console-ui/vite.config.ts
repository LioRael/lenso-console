import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { consoleStylex } from "../../config/console-stylex";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@lenso/console-tokens/tokens.stylex",
        replacement: resolve(
          import.meta.dirname,
          "../console-tokens/src/tokens.stylex.ts"
        ),
      },
    ],
  },
  build: {
    cssCodeSplit: false,
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.tsx"),
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "@lenso/console-module-api"],
      output: {
        assetFileNames: "[name][extname]",
      },
    },
    outDir: resolve(import.meta.dirname, "dist"),
  },
  plugins: [react(), consoleStylex({ devMode: "off" })],
});
