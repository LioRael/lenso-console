import path from "node:path";

import { defineConfig } from "vite";

import { consoleStylex } from "../../config/console-stylex.ts";

export default defineConfig({
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    lib: {
      entry: {
        index: path.resolve(import.meta.dirname, "src/index.ts"),
        "tokens.stylex": path.resolve(
          import.meta.dirname,
          "src/tokens.stylex.ts"
        ),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: path.resolve(import.meta.dirname, "dist"),
    rollupOptions: {
      external: ["@stylexjs/stylex"],
      output: {
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [consoleStylex({ devMode: "off" })],
});
