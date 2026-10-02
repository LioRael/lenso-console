import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { packageConsole } from "./package-console.mjs";

const [binary, webRoot] = process.argv.slice(2);
if (!binary || !webRoot) {
  throw new Error("Usage: smoke-console.mjs <built-console-binary> <web-root>");
}
const temp = await mkdtemp(join(tmpdir(), "console-no-agent-"));
let child;
let exited;
try {
  const target = `${process.platform}-${process.arch}`;
  const staged = await packageConsole(
    target,
    resolve(binary),
    resolve(webRoot),
    join(temp, "packages")
  );
  await mkdir(join(staged.launcher, "node_modules/@lenso"), {
    recursive: true,
  });
  await symlink(
    staged.platform,
    join(staged.launcher, "node_modules/@lenso", `console-${target}`)
  );
  await mkdir(join(temp, "empty-path"));
  await mkdir(join(temp, "project"));
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const { port } = reserve.address();
  const closed = once(reserve, "close");
  reserve.close();
  await closed;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        ![
          "LENSO_AGENT_",
          "LENSO_CONSOLE_AGENT_",
          "LENSO_CONSOLE_CONNECTED_AGENT_",
          "LENSO_CONSOLE_MANAGED_",
        ].some((prefix) => key.startsWith(prefix))
    )
  );
  Object.assign(env, {
    HTTP_HOST: "127.0.0.1",
    LENSO_APP_ROOT: join(temp, "project"),
    LENSO_CONSOLE_HOME: join(temp, "state"),
    PATH: join(temp, "empty-path"),
  });
  child = spawn(
    process.execPath,
    [
      join(staged.launcher, "bin/lenso-console.mjs"),
      "--port",
      String(port),
      "--no-open",
    ],
    { cwd: join(temp, "project"), env, stdio: ["ignore", "pipe", "pipe"] }
  );
  exited = once(child, "exit");
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 25_000;
    while (!output.includes(`Lenso Console listening on ${base}`)) {
      if (
        child.exitCode !== null ||
        child.signalCode !== null ||
        Date.now() > deadline
      ) {
        throw new Error(`Console did not become ready: ${output}`);
      }
      await delay(50);
    }
    const agentsResponse = await fetch(`${base}/api/console/v1/agents`);
    assert.equal(agentsResponse.status, 200);
    const catalog = await agentsResponse.json();
    assert.deepEqual(catalog.agents, []);
    const shell = await fetch(base);
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /<html/iu);
    const cohort = JSON.parse(
      await readFile(join(staged.platform, "package.json"))
    );
    assert.equal(cohort.dependencies, undefined);
    console.log(
      "PASS: packaged Console serves its shell and an empty Agent catalog with no Agent on PATH and no Agent connection configured."
    );
  } finally {
    clearTimeout(timer);
  }
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await exited;
  }
  await rm(temp, { force: true, recursive: true });
}
