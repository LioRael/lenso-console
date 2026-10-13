import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepareRuntimeFixture } from "./prepare-runtime-fixture";

const roots = [];
const makeRoot = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "runtime-fixture-check-"));
  roots.push(root);
  return root;
};
const write = (root, relative, content = "") => {
  const file = path.join(root, ".runtime-deps", "runtime", relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const fixture = (root) => {
  write(root, "Cargo.toml", '[workspace]\nmembers = ["crates/kernel"]\n');
  write(root, "Cargo.lock", "# locked source provenance\n");
  write(root, "crates/kernel/Cargo.toml", '[package]\nname = "kernel"\n');
  write(root, "examples/batch/Cargo.toml", '[package]\nname = "logs-batch"\n');
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

test("fails closed when the pinned Runtime source or lock provenance is absent", async () => {
  const missingSourceRoot = makeRoot();
  await expect(prepareRuntimeFixture(missingSourceRoot)).rejects.toThrow(
    "Verified Runtime source is missing"
  );

  const missingLockRoot = makeRoot();
  fixture(missingLockRoot);
  rmSync(path.join(missingLockRoot, ".runtime-deps/runtime/Cargo.lock"));
  await expect(prepareRuntimeFixture(missingLockRoot)).rejects.toThrow(
    "Locked Runtime provenance is missing"
  );
});

test("executes only the pinned locked Runtime packages and requires both binaries", async () => {
  const root = makeRoot();
  fixture(root);
  let invocation;
  await expect(
    prepareRuntimeFixture(root, {
      execute: (command, args, options) => {
        invocation = { args, command, options };
        return { status: 0 };
      },
    })
  ).rejects.toThrow("did not produce required binary");
  expect(invocation).toEqual({
    args: [
      "+1.94.0",
      "build",
      "--locked",
      "-p",
      "kernel",
      "-p",
      "logs-batch",
      "--target-dir",
      path.join(root, ".runtime-deps/runtime-target"),
    ],
    command: "cargo",
    options: expect.objectContaining({
      cwd: path.join(root, ".runtime-deps/runtime"),
      killSignal: "SIGKILL",
      timeout: 600000,
    }),
  });

  const binaryDirectory = path.join(root, ".runtime-deps/runtime-target/debug");
  mkdirSync(binaryDirectory, { recursive: true });
  for (const binary of ["lenso-runtime", "logs-batch"]) {
    writeFileSync(path.join(binaryDirectory, binary), "");
  }
  await expect(
    prepareRuntimeFixture(root, {
      execute: (command, args, options) => {
        invocation = { args, command, options };
        return { status: 0 };
      },
    })
  ).resolves.toBeUndefined();
});
