import { rename } from "node:fs/promises";

import stylex from "@stylexjs/unplugin/vite";
import { build } from "vite";

const root = import.meta.dirname;
const loginOnly = process.argv.includes("--login-styles");
const output = loginOnly ? "dist/login" : "dist";
await build({
  configFile: false,
  root,
  plugins: [stylex({ dev: false, devMode: "off", useCSSLayers: false })],
  build: {
    outDir: output,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: loginOnly ? "src/console-login.tsx" : "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: (id) =>
        !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
  },
});
// No global CSS entry is needed: the extraction plugin emits this fallback asset.
await rename(
  new URL(`${output}/assets/stylex.css`, import.meta.url),
  new URL(`${output}/styles.css`, import.meta.url)
);
if (!loginOnly) {
  // The extraction plugin shares its rule store across builds in one process.
  // Isolate login extraction so it cannot inherit the Shell and Dock's rules.
  const login = Bun.spawn(
    [process.execPath, import.meta.filename, "--login-styles"],
    {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  if (await login.exited) {
    throw new Error("Console login stylesheet build failed");
  }
}
