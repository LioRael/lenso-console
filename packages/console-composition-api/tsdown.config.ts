import path from "node:path";

import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: path.resolve(import.meta.dirname, "src/index.ts"),
  format: "esm",
  outDir: path.resolve(import.meta.dirname, "dist"),
  platform: "neutral",
  report: false,
  tsconfig: path.resolve(import.meta.dirname, "tsconfig.build.json"),
});
