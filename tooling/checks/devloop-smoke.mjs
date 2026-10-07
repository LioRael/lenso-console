import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium } from "playwright";

const { values } = parseArgs({
  options: {
    app: { type: "string" },
    chromium: { type: "string" },
    cli: { type: "string" },
    out: { type: "string" },
  },
});
assert.ok(
  values.app && values.cli,
  "Provide --app (incremental-dev App) and --cli"
);
const app = path.resolve(values.app);
const repo = path.resolve(import.meta.dirname, "../..");
const shell = path.join(repo, "plugins/console/shell");
const frontend = path.join(app, "frontend");
const route = path.join(shell, "src/routes/__root.tsx");
const originalRoute = fs.readFileSync(route, "utf-8");
const probeSource = path.join(frontend, "probe.ts");
const instrumentedRoute = `import ${JSON.stringify(probeSource)};\n${originalRoute}`;
const probe = (value) =>
  `if (typeof document !== "undefined") document.documentElement.dataset.devloopProbe = ${JSON.stringify(value)};\n`;
const lines = [];
let child;
let browser;
let createdFrontend = false;
let instrumented = false;
let shutdownFailed = false;

const artifacts = () => {
  const directory = path.join(
    app,
    ".lenso/host-cache/source/target/release/deps"
  );
  return Object.fromEntries(
    fs
      .readdirSync(directory)
      .filter((name) => /^libdevloop.*\.rlib$/u.test(name))
      .map((name) => {
        const file = path.join(directory, name);
        return [
          name,
          {
            mtimeMs: fs.statSync(file).mtimeMs,
            sha256: createHash("sha256")
              .update(fs.readFileSync(file))
              .digest("hex"),
          },
        ];
      })
  );
};

const wait = async (predicate) => {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `App dev exited\n${lines.join("")}`);
    if (predicate()) {
      return;
    }
    await delay(20);
  }
  throw new Error(`Dev readiness timed out\n${lines.slice(-40).join("")}`);
};

try {
  // Refuse to overwrite an author's existing frontend configuration.
  fs.mkdirSync(frontend);
  createdFrontend = true;
  fs.writeFileSync(probeSource, probe("before"));
  fs.writeFileSync(
    path.join(frontend, "run.mjs"),
    `process.env.VITE_CONSOLE_MODE='mock'; process.env.VITE_CONSOLE_DEV_MODE='mock';
const {createServer}=await import(${JSON.stringify(path.join(repo, "node_modules/vite/dist/node/index.js"))});
const server=await createServer({root:${JSON.stringify(shell)},configFile:${JSON.stringify(path.join(shell, "vite.config.ts"))},server:{host:'127.0.0.1',port:5174,strictPort:true,fs:{allow:${JSON.stringify([repo, frontend])}}}});
await server.listen(); server.printUrls();\n`
  );
  fs.writeFileSync(
    path.join(frontend, "lenso.dev.toml"),
    'schema="lenso.frontend-dev.v1"\ncommand=["node","run.mjs"]\nurl="http://127.0.0.1:5174/"\nbackend_url_mode="file"\n'
  );
  fs.writeFileSync(route, instrumentedRoute);
  instrumented = true;
  child = spawn(path.resolve(values.cli), ["app", "dev", "--root", app], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (bytes) => lines.push(bytes.toString()));
  child.stdout.on("data", (bytes) => lines.push(bytes.toString()));
  await wait(() => lines.some((line) => line.includes("Watching ")));
  browser = await chromium.launch(
    values.chromium ? { executablePath: values.chromium } : undefined
  );
  const page = await browser.newPage({
    viewport: { height: 900, width: 1280 },
  });
  await page.goto("http://127.0.0.1:5174/");
  await page.waitForFunction(
    () => document.documentElement.dataset.devloopProbe === "before"
  );
  await page
    .getByText("Loading Console", { exact: true })
    .waitFor({ state: "hidden" });
  const before = artifacts();
  assert.equal(
    Object.keys(before).length,
    2,
    "Use the two-package incremental-dev example"
  );
  const handshakeBefore = await fetch("http://127.0.0.1:5174/__lenso/backend");
  assert.equal(handshakeBefore.status, 200);
  const backendBefore = await handshakeBefore.text();
  const started = performance.now();
  fs.writeFileSync(probeSource, probe("after"));
  await page.waitForFunction(
    () => document.documentElement.dataset.devloopProbe === "after"
  );
  await page
    .getByText("Loading Console", { exact: true })
    .waitFor({ state: "hidden" });
  const elapsed = performance.now() - started;
  const feedbackFile = path.join(app, ".lenso/dev-feedback.json");
  await wait(
    () =>
      JSON.parse(fs.readFileSync(feedbackFile, "utf-8")).change === "frontend"
  );
  const feedback = JSON.parse(fs.readFileSync(feedbackFile, "utf-8"));
  assert.equal(feedback.build_invoked, false);
  assert.equal(feedback.generation, 1);
  assert.equal(feedback.status, "delegated");
  const after = artifacts();
  assert.deepEqual(after, before);
  const handshakeAfter = await fetch("http://127.0.0.1:5174/__lenso/backend");
  assert.equal(await handshakeAfter.text(), backendBefore);
  const health = await fetch(`${backendBefore.trim()}health`);
  assert.equal(await health.json(), "ok");
  const evidence = {
    artifacts_after: after,
    artifacts_before: before,
    backend_health: "ok",
    backend_url_unchanged: true,
    data_source:
      "Console Shell mock data; real Vite and browser; real native Greeting/Health App",
    edit_to_browser_ready_ms: elapsed,
    feedback,
  };
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  process.stdout.write(json);
  if (values.out) {
    fs.writeFileSync(values.out, json);
  }
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGINT");
    await Promise.race([
      once(child, "exit"),
      delay(30_000, undefined, { ref: false }),
    ]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      shutdownFailed = true;
    }
  }
  if (instrumented) {
    assert.equal(
      fs.readFileSync(route, "utf-8"),
      instrumentedRoute,
      "Console source changed during the probe; preserve and review it manually"
    );
    fs.writeFileSync(route, originalRoute);
  }
  if (createdFrontend && !shutdownFailed) {
    fs.rmSync(frontend, { recursive: true });
  }
}
assert.equal(
  shutdownFailed,
  false,
  "App dev did not stop within its shutdown budget; frontend configuration retained for retirement review"
);
