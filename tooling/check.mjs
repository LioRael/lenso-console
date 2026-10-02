import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (args) => {
  console.log(`+ pnpm ${args.join(" ")}`);
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  assert.equal(
    result.status,
    0,
    result.error?.message ?? `pnpm ${args.join(" ")} failed`
  );
};
assert.ok(
  !process.env.LENSO_BROWSER_EXECUTABLE_PATH,
  "The complete gate requires Playwright's pinned Chromium; use a focused command for alternate-browser diagnostics."
);
run(["check:preflight"]);
// Browser installation follows cheap type/descriptor checks in both local and
// CI entrypoints. Playwright's exact package version owns Chromium's revision.
run([
  "exec",
  "playwright",
  "install",
  ...(process.env.CI && process.platform === "linux" ? ["--with-deps"] : []),
  "chromium",
]);
run(["check:full"]);
