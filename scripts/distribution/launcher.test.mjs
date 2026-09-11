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
  launchNative,
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
  assert.match(output, /Usage: lenso-agent \[terminal options\]/u);
});

test("native dispatch preserves arguments and does not intercept subcommand help", () => {
  assert.deepEqual(parseArgs([]), { args: [], executable: "lenso-agent" });
  assert.deepEqual(parseArgs(["--profile", "code"]), {
    args: ["--profile", "code"],
    executable: "lenso-agent",
  });
  for (const command of [
    "tui",
    "cli",
    "acp",
    "run",
    "auth",
    "sessions",
    "doctor",
    "unknown",
  ]) {
    assert.deepEqual(parseArgs([command, "--help"]), {
      args: [command, "--help"],
      executable: "lenso-agent",
    });
  }
  const args = ["run", "--profile", "plan", "doctor"];
  assert.deepEqual(parseArgs(args), { args, executable: "lenso-agent" });
});

test("native launch uses the bundled executable, preserves cwd and args, and propagates failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "lenso-native-test-"));
  try {
    await mkdir(join(root, "bin"));
    const exe = join(root, "bin/lenso-agent-cli");
    await writeFile(
      exe,
      `#!${process.execPath}\nif (process.cwd() !== ${JSON.stringify(process.cwd())}) process.exit(2);\nif (JSON.stringify(process.argv.slice(2)) !== '["literal ; request","--help"]') process.exit(3);\nprocess.exit(17);\n`
    );
    await chmod(exe, 0o755);
    assert.equal(
      await launchNative(
        {
          args: ["literal ; request", "--help"],
          executable: "lenso-agent-cli",
        },
        root
      ),
      17
    );
    await assert.rejects(
      launchNative({ args: [], executable: "missing" }, root),
      /ENOENT/u
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("native stdio is transparent and signals stop the owned child", async () => {
  const root = await mkdtemp(join(tmpdir(), "lenso-native-stdio-"));
  const module = new URL(
    "../../packages/agent/bin/lenso-agent.mjs",
    import.meta.url
  ).href;
  try {
    await mkdir(join(root, "bin"));
    const executable = join(root, "bin/lenso-agent-acp");
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdin.pipe(process.stdout);\n`
    );
    await chmod(executable, 0o755);
    const code = `import { launchNative } from ${JSON.stringify(module)}; process.exitCode = await launchNative({executable:'lenso-agent-acp',args:[]},${JSON.stringify(root)});`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      stdio: "pipe",
    });
    const exited = once(child, "exit");
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stdin.end('{"jsonrpc":"2.0","id":1}\n');
    const [exitCode] = await exited;
    assert.equal(exitCode, 0);
    assert.equal(output, '{"jsonrpc":"2.0","id":1}\n');
    await writeFile(
      executable,
      `#!${process.execPath}\nconsole.log(process.pid); setInterval(()=>{},1000);\n`
    );
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const running = spawn(
        process.execPath,
        ["--input-type=module", "-e", code],
        { stdio: "pipe" }
      );
      try {
        const ended = once(running, "exit", {
          signal: AbortSignal.timeout(5000),
        });
        const [pid] = await once(running.stdout, "data", {
          signal: AbortSignal.timeout(5000),
        });
        running.kill(signal);
        const [signalExitCode] = await ended;
        assert.equal(signalExitCode, signal === "SIGINT" ? 130 : 143);
        assert.throws(() => process.kill(Number(pid.toString().trim()), 0), {
          code: "ESRCH",
        });
      } finally {
        running.kill("SIGKILL");
      }
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
