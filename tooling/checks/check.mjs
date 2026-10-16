import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (args) => {
  console.log(`+ bun ${args.join(" ")}`);
  const started = performance.now();
  const result = spawnSync("bun", args, {
    env: { ...process.env },
    stdio: "inherit",
  });
  console.log(
    `Console gate: bun ${args.join(" ")} elapsed=${((performance.now() - started) / 1000).toFixed(2)}s status=${result.status}`
  );
  assert.equal(
    result.status,
    0,
    result.error?.message ?? `bun ${args.join(" ")} failed`
  );
};
assert.ok(
  !process.env.LENSO_BROWSER_EXECUTABLE_PATH,
  "The complete gate requires Playwright's pinned Chromium; use a focused command for alternate-browser diagnostics."
);
run(["run", "check:preflight"]);
run(["run", "test:runtime-tooling"]);
process.env.LENSO_RUNTIME_ROOT = `${process.cwd()}/.runtime-deps/runtime`;
process.env.LENSO_RUNTIME_BIN_DIR = `${process.cwd()}/.runtime-deps/runtime-target/debug`;
process.env.LENSO_REQUIRE_RUNTIME = "1";
run(["tooling/checks/prepare-runtime-fixture.mjs"]);
// Browser installation follows cheap type checks in both local and
// CI entrypoints. Playwright's exact package version owns Chromium's revision.
run([
  "--bun",
  "x",
  "--no-install",
  "playwright",
  "install",
  ...(process.env.CI && process.platform === "linux" ? ["--with-deps"] : []),
  "chromium",
]);
run(["run", "check:full"]);
