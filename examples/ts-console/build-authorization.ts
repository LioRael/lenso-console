import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const authorizationArtifactDirectory = path.resolve(
  import.meta.dir,
  "../../.artifacts/ts-console/authorization"
);

export async function buildAuthorizationPage() {
  await mkdir(authorizationArtifactDirectory, { recursive: true });
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
      entry: path.resolve(import.meta.dir, "console/authorization"),
      output: authorizationArtifactDirectory,
      plugin_id: "authorization",
      release_version: "1.0.0",
      options: {},
    })
  );
  child.stdin.end();
  if ((await child.exited) !== 0) {
    throw new Error("Authorization page compilation failed.");
  }
}

if (import.meta.main) {
  await buildAuthorizationPage();
}
