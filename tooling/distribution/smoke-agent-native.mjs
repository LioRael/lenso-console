// Consume actual native npm archives in an empty workspace, with no Agent on PATH.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [destination, evidence] = process.argv.slice(2);
const output = resolve(destination);
const target = `${process.platform}-${process.arch}`;
const root = await mkdtemp(join(tmpdir(), "lenso-native-consumer-"));
const results = [];
try {
  const workspace = join(root, "workspace");
  const home = join(root, "home");
  const runtimePath = join(root, "path");
  for (const path of [workspace, home, runtimePath]) {
    await mkdir(path);
  }
  await symlink(process.execPath, join(runtimePath, "node"));
  await writeFile(join(workspace, "package.json"), '{"private":true}');
  await writeFile(join(root, "npmrc"), "");
  await writeFile(join(root, "global-npmrc"), "");
  const npmEnvironment = {
    ...process.env,
    HOME: home,
    npm_config_cache: join(root, "npm-cache"),
    npm_config_globalconfig: join(root, "global-npmrc"),
    npm_config_offline: "true",
    npm_config_userconfig: join(root, "npmrc"),
  };
  const archives = [];
  for (const name of [`agent-native-${target}`, "agent-native"]) {
    const packed = spawnSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
      {
        cwd: join(output, name),
        encoding: "utf-8",
        env: npmEnvironment,
      }
    );
    assert.equal(packed.status, 0, packed.stderr);
    archives.push(
      join(root, Object.values(JSON.parse(packed.stdout))[0].filename)
    );
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
    {
      cwd: workspace,
      encoding: "utf-8",
      env: npmEnvironment,
    }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const runtime = join(
    workspace,
    "node_modules/@lenso",
    `agent-native-${target}`
  );
  const cohort = JSON.parse(await readFile(join(runtime, "cohort.json")));
  const executables = ["lenso-agent", "lenso-agent-acp", "lenso-agent-cli"];
  const nativeFiles = await readdir(join(runtime, "bin"));
  const runtimeFiles = await readdir(runtime);
  assert.deepEqual(nativeFiles.toSorted(), executables);
  assert.ok(!runtimeFiles.includes("web"));
  const env = {
    CODEX_HOME: join(home, "codex"),
    HOME: home,
    LENSO_AGENT_HOME: join(home, "agent"),
    PATH: runtimePath,
    TERM: "dumb",
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
  };
  const run = (executable, args) => {
    const result = spawnSync(executable, args, {
      cwd: workspace,
      encoding: "utf-8",
      env,
      timeout: 30000,
    });
    results.push({
      args,
      executable: executable.slice(workspace.length + 1),
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout;
  };
  for (const executable of executables) {
    const version = run(join(runtime, "bin", executable), ["--version"]);
    assert.equal(version.trim().split(/\s+/u).at(-1), cohort.agent.version);
  }
  const launcher = join(workspace, "node_modules/.bin/lenso-agent");
  assert.doesNotThrow(() => JSON.parse(run(launcher, ["doctor", "--json"])));
  assert.match(run(launcher, ["run", "--help"]), /usage: lenso-agent run/u);
  assert.equal(
    run(launcher, ["acp", "--version"]).trim().split(/\s+/u).at(-1),
    cohort.agent.version
  );
  if (evidence) {
    await writeFile(
      resolve(evidence),
      `${JSON.stringify({ cohort, isolatedPath: true, realReleaseBinaries: true, results, target }, null, 2)}\n`
    );
  }
  console.log(
    `Native npm consumer passed: ${cohort.agent.version}; doctor, run --help, ACP and all companion versions.`
  );
} finally {
  await rm(root, { force: true, recursive: true });
}
