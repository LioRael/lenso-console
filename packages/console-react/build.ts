import { rename } from "node:fs/promises";

import stylex from "@stylexjs/unplugin/vite";
import { build } from "vite";

const root = import.meta.dirname;
await build({
  configFile: false,
  root,
  plugins: [stylex({ dev: false, devMode: "off", useCSSLayers: false })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    rollupOptions: {
      external: (id) =>
        !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
  },
});
// No global CSS entry is needed: the extraction plugin emits this fallback asset.
await rename(
  new URL("dist/assets/stylex.css", import.meta.url),
  new URL("dist/styles.css", import.meta.url)
);
