// Package the declared release cohort and consume real npm archives. This is a
// read-only distribution check; packaging verifies upstream archive checksums.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "lenso-native-check-"));
const run = (script, args) => {
  const result = spawnSync(
    process.execPath,
    [new URL(script, import.meta.url).pathname, ...args],
    {
      stdio: "inherit",
    }
  );
  assert.equal(result.status, 0, result.error?.message ?? `${script} failed`);
};
try {
  const output = join(root, "packages");
  run("package-agent.mjs", [
    `${process.platform}-${process.arch}`,
    "unused-console-binary",
    output,
    "--native-only",
  ]);
  run("smoke-agent-native.mjs", [
    output,
    ...(process.argv[2] ? [process.argv[2]] : []),
  ]);
} finally {
  await rm(root, { force: true, recursive: true });
}
