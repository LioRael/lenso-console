import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const authorizationArtifactDirectory = path.resolve(
  import.meta.dir,
  "../../.artifacts/ts-console/authorization"
);

export function administrationArtifactDirectory(id: string) {
  return path.resolve(import.meta.dir, "../../.artifacts/ts-console", id);
}

async function buildPage(id: string, pluginId: string) {
  const output = administrationArtifactDirectory(id);
  await mkdir(output, { recursive: true });
  const require = createRequire(import.meta.url);
  const compiler = require.resolve("@lenso/console-sdk/compiler");
  const child = Bun.spawn([process.execPath, compiler], {
    stdin: "pipe",
    stdout: "inherit",
    stderr: "inherit",
  });
  child.stdin.write(
    JSON.stringify({
      schema: "lenso.convention-compile.v1",
      entry: path.resolve(import.meta.dir, "console", id),
      output,
      plugin_id: pluginId,
      release_version: "1.0.0",
      options: {},
    })
  );
  child.stdin.end();
  if ((await child.exited) !== 0) {
    throw new Error(`${id} page compilation failed.`);
  }
}

export async function buildAuthorizationPage() {
  await buildPage("authorization", "authorization");
}

export async function buildAdministrationPages() {
  for (const id of ["identity", "access", "agent"]) {
    await buildPage(id, "console-administration");
  }
}

if (import.meta.main) {
  await buildAuthorizationPage();
  await buildAdministrationPages();
}
