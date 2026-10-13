import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const runtimeArtifactDirectory = path.resolve(
  import.meta.dir,
  "../../.artifacts/ts-console/runtime"
);

export async function buildRuntimePage() {
  await mkdir(runtimeArtifactDirectory, { recursive: true });
  const require = createRequire(import.meta.url);
  const child = Bun.spawn(
    [process.execPath, require.resolve("@lenso/console-sdk/compiler")],
    {
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  child.stdin.write(
    JSON.stringify({
      schema: "lenso.convention-compile.v1",
      entry: path.resolve(
        import.meta.dir,
        "../../packages/console-runtime/console"
      ),
      output: runtimeArtifactDirectory,
      plugin_id: "runtime",
      release_version: "0.1.0",
      options: {},
    })
  );
  child.stdin.end();
  if ((await child.exited) !== 0) {
    throw new Error("Runtime page compilation failed.");
  }
}

if (import.meta.main) {
  await buildRuntimePage();
}
