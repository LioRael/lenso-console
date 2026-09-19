import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

const verifyServices = async (cli, app, env) => {
  const child = spawn(cli, ["app", "start", "--from", path.join(app, "dist")], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 20000);
  try {
    let base;
    for await (const line of createInterface({ input: child.stderr })) {
      const match = line.match(/http:\/\/127\.0\.0\.1:[0-9]+/u);
      if (match) {
        [base] = match;
        break;
      }
    }
    assert.ok(base, "Host did not expose an HTTP endpoint");
    const catalogResponse = await fetch(`${base}/api/console/v1/pages`);
    const catalog = await catalogResponse.json();
    const [mount] = catalog.mounts;
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
    const allowed = await invoke("42");
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.id, "42");
    const denied = await invoke("99");
    assert.equal(denied.status, 422);
  } finally {
    clearTimeout(timeout);
    child.kill("SIGTERM");
    if (child.exitCode === null) {
      await once(child, "exit");
    }
  }
};

const kit = process.env.LENSO_CONSOLE_DEV_KIT;
// Guards the complete consumer closure: a cached Cargo build cannot mask a
// missing precompiled Host, compiler, SDK projection, or bundled Bun executable.
test(
  "Console creation, build and startup work with only development-kit tools",
  { skip: !kit, timeout: 120000 },
  async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "console-no-rust-"));
    const app = path.join(temp, "app");
    const cli = path.join(kit, "bin/lenso");
    const env = { ...process.env, PATH: path.join(kit, "bin") };
    const run = (args) => {
      const result = spawnSync(cli, args, {
        encoding: "utf-8",
        env,
        timeout: 90000,
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    try {
      run(["app", "create", app, "--console"]);
      assert.ok(
        fs.existsSync(path.join(app, "app/orders/console/orders/[id]/page.tsx"))
      );
      run(["app", "build", "--root", app]);
      run(["app", "start", "--from", path.join(app, "dist"), "--check"]);
      await verifyServices(cli, app, env);
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
