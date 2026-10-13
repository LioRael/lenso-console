import { rename, rm } from "node:fs/promises";

import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

await rm(new URL("dist", import.meta.url), { recursive: true, force: true });
await build({
  configFile: false,
  root: import.meta.dir,
  plugins: [
    stylex({ dev: false, devMode: "full", useCSSLayers: false }),
    react(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    lib: { entry: "src/react.ts", formats: ["es"], fileName: "react" },
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
const declarations = Bun.spawn(
  ["bun", "run", "--bun", "tsc", "-p", "tsconfig.build.json"],
  {
    cwd: import.meta.dir,
    stdout: "inherit",
    stderr: "inherit",
  }
);
if ((await declarations.exited) !== 0) {
  process.exit(1);
}
const result = await Bun.build({
  entrypoints: [
    `${import.meta.dir}/src/server.ts`,
    `${import.meta.dir}/src/client.ts`,
  ],
  outdir: `${import.meta.dir}/dist`,
  target: "browser",
  packages: "external",
  splitting: true,
  // Published pages must run with React's production runtime, where jsxDEV is absent.
  jsx: { runtime: "automatic", development: false },
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
