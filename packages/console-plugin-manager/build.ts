import { rename, rm } from "node:fs/promises";

import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

await rm(new URL("dist", import.meta.url), { recursive: true, force: true });
await build({
  configFile: false,
  plugins: [
    stylex({ dev: false, devMode: "full", useCSSLayers: false }),
    react(),
  ],
  build: {
    lib: { entry: "src/react.ts", formats: ["es"], fileName: "react" },
    cssFileName: "styles",
    rollupOptions: {
      external: (id) =>
        !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
  },
});
await rename(
  new URL("dist/assets/stylex.css", import.meta.url),
  new URL("dist/styles.css", import.meta.url)
);
