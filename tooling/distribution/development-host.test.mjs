import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

const verifyApp = async (cli, app, env, services) => {
  const child = spawn(cli, ["app", "start", "--from", path.join(app, "dist")], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 20000);
  let stderr = "";
  let stage = "Host readiness";
  const lines = createInterface({ input: child.stderr });
  const { promise: endpoint, resolve } = Promise.withResolvers();
  lines.on("line", (line) => {
    stderr = `${stderr}${line}\n`.slice(-32768);
    const match = line.match(/http:\/\/127\.0\.0\.1:[0-9]+/u);
    if (match) {
      resolve(match[0]);
    }
  });
  lines.once("close", () => resolve());
  try {
    const base = await endpoint;
    assert.ok(base, "Host did not expose an HTTP endpoint");
    stage = "catalog";
    const catalogResponse = await fetch(`${base}/api/console/v1/pages`);
    stage = `catalog response JSON (HTTP ${catalogResponse.status})`;
    const catalog = await catalogResponse.json();
    const [mount] = catalog.mounts;
    assert.ok(mount, "Console did not expose the generated page mount");
    if (!services) {
      assert.equal(mount.requirements.length, 0);
      stage = "page Shell";
      const shell = await fetch(`${base}/`);
      assert.equal(shell.status, 200);
      stage = "page module";
      const module = await fetch(`${base}${mount.module}`);
      assert.equal(module.status, 200);
      assert.match(await module.text(), /createWorkspace/u);
      return;
    }
    assert.equal(mount.requirements[0].available, true);
    const invoke = (id) =>
      fetch(
        `${base}/api/console/v1/pages/${mount.id}/services/orders/invoke/read`,
        {
          body: JSON.stringify({ id }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(10000),
        }
      );
    stage = "service allow42";
    const allowed = await invoke("42");
    assert.equal(allowed.status, 200);
    stage = `service allow42 response JSON (HTTP ${allowed.status})`;
    const body = await allowed.json();
    assert.equal(body.id, "42");
    stage = "service deny99";
    const denied = await invoke("99");
    assert.equal(denied.status, 422);
    stage = `service deny99 response JSON (HTTP ${denied.status})`;
    const deniedProblem = await denied.json();
    assert.equal(deniedProblem.code, "workspace_service_denied");
    stage = "service invalid42";
    const invalid = await invoke(42);
    assert.equal(invalid.status, 422);
    stage = `service invalid42 response JSON (HTTP ${invalid.status})`;
    const invalidProblem = await invalid.json();
    assert.equal(invalidProblem.code, "workspace_service_codec_mismatch");
  } catch (error) {
    throw new Error(
      `${stage} failed (Host exit=${child.exitCode}, signal=${child.signalCode})\nHost stderr:\n${stderr}`,
      { cause: error }
    );
  } finally {
    clearTimeout(timeout);
    child.kill("SIGTERM");
    if (child.exitCode === null && child.signalCode === null) {
      await once(child, "exit");
    }
    lines.close();
  }
};

// The launcher resolves its module path, including macOS /var -> /private/var.
// Use the same canonical path when replacing the generated Host manifest.
const kit = process.env.LENSO_CONSOLE_DEV_KIT
  ? fs.realpathSync(process.env.LENSO_CONSOLE_DEV_KIT)
  : undefined;
const services = process.env.LENSO_CONSOLE_DEV_KIT_SERVICES === "1";
const DEFAULT_COMMAND_TIMEOUT_MS = 90_000;
// `lenso.console.pages` has a bounded five-minute compiler setup window. Leave
// a small assembly margin without weakening the timeout for every CLI command.
const FIRST_CONVENTION_BUILD_TIMEOUT_MS = 330_000;
const COMPLETE_CONSUMER_TIMEOUT_MS = 420_000;
// Guards the complete consumer closure: a cached Cargo build cannot mask a
// missing precompiled Host, compiler, SDK projection, or bundled Bun executable.
test(
  `Console ${services ? "service" : "page-only"} creation, build and startup work with only development-kit tools`,
  { skip: !kit, timeout: COMPLETE_CONSUMER_TIMEOUT_MS },
  async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "console-no-rust-"));
    const app = path.join(temp, "app");
    const cli = path.join(kit, "bin/lenso");
    const env = { ...process.env, PATH: path.join(kit, "bin") };
    const run = (args, timeout = DEFAULT_COMMAND_TIMEOUT_MS) => {
      const result = spawnSync(cli, args, {
        encoding: "utf-8",
        env,
        timeout,
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    try {
      run(["app", "create", app, "--console"]);
      if (services) {
        fs.cpSync(
          path.join(kit, "packages/console-authoring/service-example"),
          path.join(app, "app/orders/console"),
          { recursive: true }
        );
      }
      assert.ok(
        fs.existsSync(path.join(app, "app/orders/console/orders/[id]/page.tsx"))
      );
      run(["app", "build", "--root", app], FIRST_CONVENTION_BUILD_TIMEOUT_MS);
      run(["app", "start", "--from", path.join(app, "dist"), "--check"]);
      await verifyApp(cli, app, env, services);
      assert.ok(!fs.existsSync(path.join(app, ".lenso/host-cache")));
      fs.writeFileSync(
        path.join(app, "plugins/lenso.console.web/default.disabled"),
        ""
      );
      const inspection = JSON.parse(
        run(["app", "inspect", "--root", app, "--json"])
      );
      assert.equal(inspection.compilations.length, 0);
      assert.equal(inspection.surfaces[0].reason, "support_not_adopted");
      const disabled = path.join(temp, "disabled");
      assert.match(
        run(["app", "build", "--root", app, "--out", disabled]),
        /Assembled 0 Plugin Instances/u
      );
      run(["app", "start", "--from", disabled, "--check"]);
      // A wrong target must fail before asking for Cargo or building dependencies.
      const manifest = JSON.parse(
        fs.readFileSync(path.join(kit, "host.json"), "utf-8")
      );
      const supportToml = fs.readFileSync(
        path.join(kit, "packages/console-support/Cargo.toml"),
        "utf-8"
      );
      const supportVersion = supportToml.match(
        /^version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"\s*$/mu
      )?.[1];
      assert.ok(supportVersion, "Console support package version is missing");
      assert.equal(
        manifest.sources["lenso.console.web"].release_version,
        supportVersion
      );
      manifest.target = "unsupported-target";
      fs.writeFileSync(path.join(temp, "host.json"), JSON.stringify(manifest));
      const config = path.join(app, "lenso.toml");
      fs.writeFileSync(
        config,
        fs
          .readFileSync(config, "utf-8")
          .replace(
            JSON.stringify(path.join(kit, "host.json")),
            JSON.stringify(path.join(temp, "host.json"))
          )
      );
      const failed = spawnSync(
        cli,
        ["app", "build", "--root", app, "--out", path.join(temp, "invalid")],
        { encoding: "utf-8", env, timeout: 30000 }
      );
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /incompatible precompiled development Host/u);
      assert.ok(!fs.existsSync(path.join(temp, "invalid")));
    } finally {
      fs.rmSync(temp, { force: true, recursive: true });
    }
  }
);
