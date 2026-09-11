// Install actual npm archives into an empty workspace and exercise the real runtime.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
  realpath,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const output = resolve(process.argv[2]);
const target = `${process.platform}-${process.arch}`;
const root = await mkdtemp(join(tmpdir(), "lenso-npx-smoke-"));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(root, "npm-cache"),
  npm_config_offline: "true",
};
const homes = join(root, "state");
const cwd = join(root, "workspace");
await mkdir(cwd);
await mkdir(homes);
// Keep the disposable Console's telemetry listener isolated from running Apps.
const ingressRoot = join(homes, "console/plugins/lenso.web-ingress");
await mkdir(ingressRoot, { recursive: true });
await writeFile(
  join(ingressRoot, "telemetry.toml"),
  'bind_address = "127.0.0.1:0"\n'
);

const runtimePath = join(root, "runtime-bin");
await mkdir(runtimePath);
await symlink(process.execPath, join(runtimePath, "node"));
await writeFile(join(cwd, "package.json"), '{"private":true}');
await writeFile(join(homes, "preserve.txt"), "persistent state");
let child;
let logs = "";
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("LENSO_"))
);
const descendants = (pid) => {
  const result = spawnSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/u).map(Number));
  const children = new Map();
  for (const [item, parent] of rows) {
    const list = children.get(parent) ?? [];
    list.push(item);
    children.set(parent, list);
  }
  const found = new Set([pid]);
  const pending = [pid];
  while (pending.length > 0) {
    for (const item of children.get(pending.pop()) ?? []) {
      if (!found.has(item)) {
        found.add(item);
        pending.push(item);
      }
    }
  }
  found.delete(pid);
  return [...found];
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
};
const waitForExit = async () => {
  if (child.exitCode === null && child.signalCode === null) {
    await once(child, "exit", { signal: AbortSignal.timeout(15000) });
  }
};
const assertStopped = async (pids) => {
  for (let i = 0; i < 100 && pids.some(alive); i += 1) {
    await delay(100);
  }
  assert.deepEqual(pids.filter(alive), [], `Surviving subprocesses\n${logs}`);
};
const start = (port) => {
  logs = "";
  child = spawn(
    join(cwd, "node_modules/.bin/lenso-agent"),
    ["web", "--no-open", "--port", String(port)],
    {
      cwd,
      env: {
        ...environment,
        CODEX_HOME: join(homes, "codex"),
        HOME: homes,
        LENSO_AGENT_HOME: join(homes, "agent"),
        LENSO_CONSOLE_HOME: join(homes, "console"),
        PATH: runtimePath,
        SSH_CONNECTION: "smoke",
        XDG_CONFIG_HOME: join(homes, "config"),
        XDG_DATA_HOME: join(homes, "data"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  child.on("error", (error) => {
    logs += String(error);
  });
};
const ready = async (url) => {
  for (let i = 0; i < 600; i += 1) {
    if (logs.includes(`Lenso Console listening on ${url}`)) {
      return;
    }
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(`Runtime exited\n${logs}`);
    }
    await delay(100);
  }
  throw new Error(`Readiness timed out\n${logs}`);
};
try {
  const archives = [];
  for (const name of [`agent-${target}`, "agent"]) {
    const packed = spawnSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
      { cwd: join(output, name), encoding: "utf-8", env: npmEnvironment }
    );
    assert.equal(packed.status, 0, packed.stderr);
    archives.push(join(root, JSON.parse(packed.stdout)[0].filename));
  }
  const installed = spawnSync(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...archives,
    ],
    { cwd, encoding: "utf-8", env: npmEnvironment }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const version = spawnSync(
    "npx",
    ["--offline", "--no", "--", "lenso-agent", "--version"],
    { cwd, encoding: "utf-8", env: npmEnvironment }
  );
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/u);

  const installedRuntime = join(cwd, "node_modules/@lenso", `agent-${target}`);
  const installedCohort = JSON.parse(
    await readFile(join(installedRuntime, "cohort.json"), "utf-8")
  );
  assert.equal(version.stdout.trim(), installedCohort.consoleVersion);
  for (const executable of [
    "lenso-agent",
    "lenso-agent-cli",
    "lenso-agent-acp",
    "lenso-agent-web",
    "lenso-agent-console-web",
  ]) {
    const runtimeVersion = spawnSync(
      join(installedRuntime, "bin", executable),
      ["--version"],
      { encoding: "utf-8", env: { ...environment, HOME: homes } }
    );
    assert.equal(runtimeVersion.status, 0, runtimeVersion.stderr);
    assert.equal(
      runtimeVersion.stdout.trim().split(/\s+/u).at(-1),
      installedCohort.agent.version,
      "Installed Agent binaries must match the reviewed release cohort"
    );
  }

  for (const command of ["tui", "cli", "acp"]) {
    const result = spawnSync(
      join(cwd, "node_modules/.bin/lenso-agent"),
      [command, "--version"],
      {
        cwd,
        encoding: "utf-8",
        env: {
          ...environment,
          HOME: homes,
          LENSO_AGENT_HOME: join(homes, "terminal"),
          PATH: runtimePath,
        },
        timeout: 30000,
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim().split(/\s+/u).at(-1),
      installedCohort.agent.version
    );
  }
  const doctor = spawnSync(
    join(cwd, "node_modules/.bin/lenso-agent"),
    ["cli", "doctor", "--json"],
    {
      cwd,
      encoding: "utf-8",
      env: {
        ...environment,
        HOME: homes,
        LENSO_AGENT_HOME: join(homes, "terminal"),
        PATH: runtimePath,
      },
      timeout: 30000,
    }
  );
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.doesNotThrow(() => JSON.parse(doctor.stdout));

  const occupied = createServer();
  occupied.listen(0, "127.0.0.1");
  await once(occupied, "listening");
  const { port } = occupied.address();
  try {
    start(port);
    await waitForExit();
    assert.notEqual(child.exitCode, 0, logs);
    assert.match(logs, /address.*use|Address.*use|os error/u);
  } finally {
    occupied.close();
    await once(occupied, "close");
  }
  const url = `http://127.0.0.1:${port}`;
  for (const signal of ["SIGTERM", "SIGINT"]) {
    start(port);
    await ready(url);
    const pids = descendants(child.pid);
    assert.ok(
      pids.length >= 3,
      "Expected Console plus two independent Agent processes"
    );
    const health = await fetch(`${url}/health/ready`);
    assert.equal(health.status, 200);
    const page = await fetch(url);
    const html = await page.text();
    assert.match(html, /<html/u);
    const script = html.match(/src="([^" ]+\.js)"/u)?.[1];
    assert.ok(script, "Packaged page must reference its built JavaScript");
    const asset = await fetch(new URL(script, url));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/u);
    const listing = await fetch(`${url}/api/console/v1/agents`);
    assert.equal(listing.status, 200);
    assert.ok(JSON.stringify(await listing.json()).includes("app"));
    const bootstrapResponse = await fetch(
      `${url}/api/console/v1/agents/app/bootstrap`
    );
    assert.equal(bootstrapResponse.status, 200);
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrap.workspace.path, await realpath(cwd));
    const connections = await fetch(
      `${url}/api/console/v1/agents/app/auth/connections`
    );
    assert.equal(connections.status, 200);
    const accounts = await connections.json();
    assert.match(JSON.stringify(accounts), /browser_loopback/u);
    assert.match(JSON.stringify(accounts), /"connected":false/u);
    const profiles = await fetch(
      `${url}/api/console/v1/agents/app/control/profiles`
    );
    assert.equal(profiles.status, 200);
    child.kill(signal);
    await waitForExit();
    assert.equal(child.exitCode, 0, logs);
    await assertStopped(pids);
    assert.equal(
      await readFile(join(homes, "preserve.txt"), "utf-8"),
      "persistent state"
    );
    await assert.rejects(
      fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1000) })
    );
  }
  start(port);
  await ready(url);
  const pids = descendants(child.pid);
  const agents = descendants(pids[0]);
  assert.ok(agents.length >= 2);
  process.kill(agents[0], "SIGKILL");
  await waitForExit();
  assert.notEqual(child.exitCode, 0, logs);
  assert.match(logs, /exited unexpectedly/u);
  await assertStopped(pids);
  console.log(
    `Passed ${target}: offline npm/npx, unauthenticated UI and login controls, profiles, occupied port, SIGTERM/SIGINT, preserved Homes, child crash cleanup.`
  );
} finally {
  if (child?.exitCode === null && child?.signalCode === null) {
    child.kill("SIGTERM");
    await waitForExit();
  }
  await rm(root, { force: true, recursive: true });
}
