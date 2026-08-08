import path from "node:path";

import stylex from "@stylexjs/unplugin/rolldown";
import { defineConfig } from "tsdown";

export default defineConfig({
  deps: {
    neverBundle: ["react", "react-dom"],
  },
  dts: true,
  entry: path.resolve(import.meta.dirname, "src/index.tsx"),
  format: "esm",
  outDir: path.resolve(import.meta.dirname, "dist"),
  platform: "browser",
  plugins: [
    stylex({
      aliases: {
        "@lenso/console-tokens/tokens.stylex": [
          path.resolve(
            import.meta.dirname,
            "../console-tokens/src/tokens.stylex.ts"
          ),
        ],
      },
      devMode: "off",
      useCSSLayers: true,
    }),
  ],
  report: false,
  tsconfig: path.resolve(import.meta.dirname, "tsconfig.build.json"),
});
