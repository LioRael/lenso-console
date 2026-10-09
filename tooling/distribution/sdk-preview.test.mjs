import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import { chromium } from "playwright";

import { dev } from "../../packages/console-authoring/dev/server.mjs";

const freePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await promisify(server.close.bind(server))();
  return port;
};

// Archive byte checks cannot prove the preview renders after built-in Shell
// pages disappear, or that backend mode still refuses an unauthenticated user.
test("SDK-owned preview mounts author pages, scopes reads and keeps backend admission closed", async () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "sdk-preview-"))
  );
  const entry = path.join(root, "console");
  fs.mkdirSync(path.join(entry, "orders", "[id]"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    '{"private":true,"type":"module"}'
  );
  fs.writeFileSync(
    path.join(entry, "workspace.ts"),
    'export default {id:"example.console",title:"Orders preview",path:"/orders"};'
  );
  fs.writeFileSync(
    path.join(entry, "page.tsx"),
    `
import {Link, useWorkspaceRead} from "@lenso/console-sdk";
export default function Page(props) {
  const read=useWorkspaceRead({key:"orders.preview",params:{},read:({signal})=>props.services.invoke("orders","read",{}, {signal})});
  return <section><h2>Authored orders</h2><p>{read.data?.message ?? "Loading example"}</p><Link to={["orders","42"]}>Open order 42</Link><button onClick={()=>props.navigation.openWorkspace({workspaceId:props.mount.id,subject:props.mount.subject,segments:["orders","42"],handoff:{kind:"example.order",payload:"Selected order context"}})}>Open order context</button></section>;
}`
  );
  fs.writeFileSync(
    path.join(entry, "orders", "[id]", "page.tsx"),
    "export default function Page(props) {return <section><h2>Order {props.params.id}</h2><p>{props.location.handoff?.payload}</p></section>;}"
  );
  const examples = path.join(root, "examples.mjs");
  fs.writeFileSync(
    examples,
    'export default {async invoke(){return {message:"Explicit example data"};}};'
  );
  let preview;
  let browser;
  let host;
  let lines;
  const port = await freePort();
  try {
    preview = await dev({ entry, examples, port });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/orders`);
    try {
      await page
        .getByRole("heading", { name: "Authored orders" })
        .waitFor({ timeout: 10_000 });
    } catch (error) {
      throw new Error(
        `Preview failed: ${JSON.stringify(errors)} ${await page.locator("body").textContent()}`,
        { cause: error }
      );
    }
    await page.getByText("Explicit example data", { exact: true }).waitFor();
    const link = page.getByRole("link", { name: "Open order 42" });
    await link.focus();
    await link.press("Enter");
    await page
      .getByRole("heading", { exact: true, name: "Order 42" })
      .waitFor();
    for (const [width, theme] of [
      [1280, "light"],
      [390, "dark"],
    ]) {
      await page.setViewportSize({ height: 844, width });
      await page.evaluate(
        (value) =>
          localStorage.setItem(
            "lenso-console:theme-preference",
            JSON.stringify(value)
          ),
        theme
      );
      await page.reload();
      await page.waitForFunction(
        (value) => document.documentElement.dataset.theme === value,
        theme
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
      const navigation = page.getByRole("link", { name: "Orders preview" });
      await navigation.focus();
      assert.equal(
        await navigation.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2
          );
          return (
            element === document.activeElement &&
            bounds.height >= 44 &&
            getComputedStyle(element).outlineStyle !== "none" &&
            (hit === element || element.contains(hit))
          );
        }),
        true,
        "Preview navigation remains focused, visible and unoccluded"
      );
    }
    assert.deepEqual(errors, []);
    await page.getByRole("link", { name: "Orders preview" }).click();
    const context = page.getByRole("button", { name: "Open order context" });
    await context.focus();
    await context.press("Enter");
    await page.getByText("Selected order context", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify({
          history: history.state,
          local: { ...localStorage },
          session: { ...sessionStorage },
          url: location.href,
        }).includes("Selected order context")
      ),
      false,
      "Workspace handoff stays in preview memory, not history or storage"
    );
    await preview.stop();
    preview = undefined;
    const released = createServer();
    released.listen(port, "127.0.0.1");
    await once(released, "listening");
    await promisify(released.close.bind(released))();

    const databasePath = path.join(root, "locale.sqlite");
    execFileSync(
      "bun",
      ["examples/ts-console/locale-store/migrate.ts", databasePath],
      { stdio: "pipe" }
    );
    host = spawn("bun", ["examples/ts-console/serve.ts"], {
      env: {
        ...process.env,
        LENSO_TS_DATABASE: databasePath,
        LENSO_TS_ORIGIN: `http://127.0.0.1:${await freePort()}`,
        LENSO_TS_TOKEN: "isolated-preview-test-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let startupError;
    let stderr = "";
    host.on("error", (error) => {
      startupError = error;
    });
    host.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    const readinessSignal = AbortSignal.timeout(15_000);
    lines = createInterface({
      input: host.stdout,
      signal: readinessSignal,
    });
    let origin;
    for await (const line of lines) {
      const message = JSON.parse(line);
      if (message.ready) {
        ({ origin } = message);
        break;
      }
    }
    if (!origin) {
      throw new Error(
        `Real TS fixture did not become ready: exit=${host.exitCode} signal=${host.signalCode} stderr=${stderr}`,
        { cause: startupError ?? readinessSignal.reason }
      );
    }
    preview = await dev({ backendUrl: origin, entry, port });
    await page.goto(`http://127.0.0.1:${port}/orders`);
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.getByText("Explicit example data", { exact: true }).count(),
      0
    );
    const retry = page.getByRole("button", { name: "Retry admission" });
    await retry.focus();
    await retry.press("Enter");
    await page.getByRole("alert").waitFor();
    const response = await page.request.get(
      `http://127.0.0.1:${port}/api/console/v1/session`
    );
    assert.equal(response.status(), 401);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await preview?.stop();
    lines?.close();
    if (host?.pid && host.exitCode === null && host.signalCode === null) {
      const exit = once(host, "exit");
      host.kill("SIGTERM");
      const timeout = setTimeout(() => host.kill("SIGKILL"), 5000);
      try {
        await exit;
      } finally {
        clearTimeout(timeout);
      }
    }
    fs.rmSync(root, { force: true, recursive: true });
  }
}, 90_000);
