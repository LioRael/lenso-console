import assert from "node:assert/strict";
import fs from "node:fs";

// Contract build gates validate the canonical projections against descriptors.
// Public SDK copies must be byte-identical, never independently maintained.
for (const [contract, projection] of [
  ["lenso-capability-ui-contribution", "contribution"],
  ["lenso-capability-workspace-service", "workspace-service"],
]) {
  if (process.argv.includes("--write")) {
    fs.copyFileSync(
      `contracts/${contract}/generated/bindings.ts`,
      `packages/console-authoring/src/generated/${projection}.ts`
    );
  }
  assert.equal(
    fs.readFileSync(
      `packages/console-authoring/src/generated/${projection}.ts`,
      "utf-8"
    ),
    fs.readFileSync(`contracts/${contract}/generated/bindings.ts`, "utf-8"),
    `Console SDK ${projection} projection is stale`
  );
}
