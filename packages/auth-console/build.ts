import { rm } from "node:fs/promises";

await rm(new URL("dist", import.meta.url), { recursive: true, force: true });
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
    `${import.meta.dir}/src/react.ts`,
  ],
  outdir: `${import.meta.dir}/dist`,
  target: "browser",
  packages: "external",
  splitting: true,
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
