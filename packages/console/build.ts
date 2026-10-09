import { rm } from "node:fs/promises";

await rm(new URL("dist", import.meta.url), { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [
    "src/index.ts",
    "src/auth.ts",
    "src/integrations/audit.ts",
    "src/integrations/authorization.ts",
    "src/integrations/api-keys.ts",
    "src/integrations/limits.ts",
    "src/integrations/tasks.ts",
    "src/integrations/scheduler.ts",
  ],
  root: "src",
  outdir: "dist",
  target: "bun",
  format: "esm",
  packages: "external",
  splitting: true,
});
if (!result.success) {
  throw new AggregateError(result.logs, "Console package build failed");
}
