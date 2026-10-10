import { rm } from "node:fs/promises";

await rm(new URL("dist", import.meta.url), { recursive: true, force: true });
// One split graph preserves React contexts and shared schemas across exports.
const result = await Bun.build({
  entrypoints: [
    "src/index.ts",
    "src/react.ts",
    "src/server.ts",
    "src/client.ts",
    "src/protocol.ts",
    "src/transport.ts",
    "src/credentials.ts",
    "src/paths.ts",
    "src/locale.ts",
    "src/i18n.ts",
    "src/http-paths.ts",
    "src/browser.tsx",
    "src/browser-session-fetch.ts",
    "src/browser-query-client.ts",
  ],
  root: "src",
  outdir: "dist",
  target: "browser",
  format: "esm",
  packages: "external",
  splitting: true,
  jsx: { development: false },
});
if (!result.success) {
  throw new AggregateError(result.logs, "Console SDK package build failed");
}
