import { resolve } from "node:path";

import { defineConfig } from "vite";

import { consoleStylex } from "../../config/console-stylex";

export default defineConfig({
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        "tokens.stylex": resolve(import.meta.dirname, "src/tokens.stylex.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: resolve(import.meta.dirname, "dist"),
    rollupOptions: {
      external: ["@stylexjs/stylex"],
      output: {
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [consoleStylex({ devMode: "off" })],
});
