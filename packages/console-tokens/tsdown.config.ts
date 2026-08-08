import path from "node:path";

import stylex from "@stylexjs/unplugin/rolldown";
import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: {
    index: path.resolve(import.meta.dirname, "src/index.ts"),
    "tokens.stylex": path.resolve(import.meta.dirname, "src/tokens.stylex.ts"),
  },
  format: "esm",
  outDir: path.resolve(import.meta.dirname, "dist"),
  platform: "neutral",
  plugins: [
    stylex({
      devMode: "off",
      useCSSLayers: true,
    }),
  ],
  report: false,
  tsconfig: path.resolve(import.meta.dirname, "tsconfig.build.json"),
});
