import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseArgs,
  resolveRuntime,
  launch,
} from "../../packages/agent/bin/lenso-agent.mjs";

test("validates CLI options before resolving or starting a runtime", () => {
  assert.deepEqual(parseArgs(["web", "--port", "3456", "--no-open"]), {
    open: false,
    port: 3456,
  });
  assert.deepEqual(parseArgs(["--version"]), { version: true });
  for (const args of [
    ["web", "--port"],
    ["web", "--port", "0"],
    ["web", "--port", "65536"],
    ["web", "--host", "0.0.0.0"],
    ["tui"],
  ]) {
    assert.throws(() => parseArgs(args));
  }
  assert.throws(() => resolveRuntime("win32", "x64"), /Unsupported platform/u);
});

test("supervised process retains workspace and explicit packaged paths, and propagates failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "lenso-launcher-test-"));
  try {
    await mkdir(join(root, "bin"));
    const exe = join(root, "bin/lenso-console-with-agent");
    await writeFile(
      exe,
      `#!/usr/bin/env node\nif (process.cwd() !== ${JSON.stringify(process.cwd())}) process.exit(2);\nif (process.env.CONSOLE_WEB_ROOT !== ${JSON.stringify(join(root, "web"))}) process.exit(3);\nif (process.env.HTTP_PORT !== '3456') process.exit(4);\nprocess.exit(17);\n`
    );
    await chmod(exe, 0o755);
    assert.equal(await launch({ open: false, port: 3456 }, root), 17);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("help and version work without downloading a runtime", async () => {
  const child = spawn(
    process.execPath,
    ["packages/agent/bin/lenso-agent.mjs", "--help"],
    { stdio: "pipe" }
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  assert.match(output, /Usage: lenso-agent web/u);
});
