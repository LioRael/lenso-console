import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const parseToml = (text) => Bun.TOML.parse(text);

export const runtimeBuildArgs = (targetDir) => [
  "+1.94.0",
  "build",
  "--locked",
  "-p",
  "kernel",
  "-p",
  "logs-batch",
  "--target-dir",
  targetDir,
];

export const prepareRuntimeFixture = async (
  root,
  { execute = spawnSync, env = process.env } = {}
) => {
  const runtimeRoot = path.join(root, ".runtime-deps", "runtime");
  const targetDir = path.join(root, ".runtime-deps", "runtime-target");
  const manifest = parseToml(
    await readFile(path.join(runtimeRoot, "Cargo.toml"), "utf-8").catch(() => {
      throw new Error(
        `Verified Runtime source is missing at ${runtimeRoot}; run bun tooling/distribution/prepare-runtime-deps.mjs first.`
      );
    })
  );
  assert.ok(manifest.workspace, "Runtime source must be a Cargo workspace");
  await access(path.join(runtimeRoot, "Cargo.lock")).catch(() => {
    throw new Error(`Locked Runtime provenance is missing from ${runtimeRoot}`);
  });
  for (const [member, manifestPath] of [
    ["kernel", path.join(runtimeRoot, "crates", "kernel", "Cargo.toml")],
    ["logs-batch", path.join(runtimeRoot, "examples", "batch", "Cargo.toml")],
  ]) {
    const crateManifest = parseToml(await readFile(manifestPath, "utf-8"));
    assert.equal(
      crateManifest.package?.name,
      member,
      `Expected Runtime workspace package ${member} at ${manifestPath}`
    );
  }

  const args = runtimeBuildArgs(targetDir);
  console.log(`+ cargo ${args.join(" ")}`);
  const result = execute("cargo", args, {
    cwd: runtimeRoot,
    env,
    killSignal: "SIGKILL",
    stdio: "inherit",
    timeout: 600000,
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, `cargo ${args.join(" ")} failed`);

  const binaryDirectory = path.join(targetDir, "debug");
  for (const binary of ["lenso-runtime", "logs-batch"]) {
    const binaryPath = path.join(binaryDirectory, binary);
    await access(binaryPath).catch(() => {
      throw new Error(
        `Runtime build did not produce required binary ${binaryPath}`
      );
    });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const root = path.resolve(import.meta.dirname, "../..");
  await prepareRuntimeFixture(root);
}
