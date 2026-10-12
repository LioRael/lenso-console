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

import { createConsolePlugin } from "@lenso/console";
import { startApp } from "@lenso/core";
import { chromium } from "playwright";

import { createLocalAuthentication } from "../../examples/ts-console/local-auth";
import { createBuiltShell } from "../../examples/ts-console/shell";
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
// Local Shell fixtures cannot catch SDK hosts silently dropping page contributions.
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
  fs.symlinkSync(
    path.resolve("node_modules"),
    path.join(root, "node_modules"),
    "dir"
  );
  fs.mkdirSync(path.join(entry, "node_modules", "@lenso"), { recursive: true });
  fs.symlinkSync(
    path.resolve("packages/console-react"),
    path.join(entry, "node_modules", "@lenso", "console-react"),
    "dir"
  );
  fs.writeFileSync(
    path.join(entry, "workspace.ts"),
    'export default {id:"example.console",title:"Orders preview",path:"/orders",services:["orders"]};'
  );
  fs.writeFileSync(
    path.join(entry, "services.ts"),
    `import {defineServices,operation} from "@lenso/console-sdk/server";
export default defineServices({orders:{capabilityId:"fixture.orders@1",version:"1.0.0",operations:{
  read:operation({effect:"read",parse:()=>({}),authorize:()=>true,handle:()=>({message:"Real admitted data"})})
}}});`
  );
  fs.writeFileSync(
    path.join(entry, "page.tsx"),
    `
import {Link, useWorkspaceRead} from "@lenso/console-sdk/react";
import type {PageProps} from "@lenso/console-sdk";
import {ConsoleActionScope,ConsolePageScope} from "@lenso/console-react";
import {useRef,useState} from "react";
export default function Page(props:PageProps) {
  const [count,setCount]=useState(0);
  const [disabled,setDisabled]=useState(false);
  const [hidden,setHidden]=useState(false);
  const [selected,setSelected]=useState(false);
  const inspector=useRef<HTMLDialogElement>(null);
  const read=useWorkspaceRead({key:"orders.preview",params:{},read:({signal})=>props.services.invoke("orders","read",{}, {signal})});
  return <ConsolePageScope scopeKey={props.activation!.key} value={{
    context:hidden ? {kind:"hidden"} : {kind:"tabs",label:"Order views",activeId:"list",tabs:[{id:"list",label:"Orders",href:props.navigation.href([])},{id:"detail",label:"Order detail",href:props.navigation.href(["orders","42"])}]},
    commands:[{id:"count",label:"Count order",disabled,onInvoke:()=>setCount(value=>value+1)}],
  }}><ConsoleActionScope scopeKey={props.activation!.key} value={selected ? {count:1,scopeLabel:"Current orders",actions:[{id:"count",label:"Count selection",icon:null,onInvoke:()=>setCount(value=>value+1)}],running:false,onExit:()=>setSelected(false)} : null}><section><h2>Authored orders</h2><output aria-label="Order count">{count}</output><input aria-label="Order draft" /><button onClick={()=>setDisabled(value=>!value)}>Toggle count guard</button><button onClick={()=>setHidden(value=>!value)}>Toggle context</button><button onClick={()=>setSelected(value=>!value)}>Toggle selection</button><button onClick={()=>inspector.current?.showModal()}>Open inspector</button><dialog ref={inspector} aria-label="Order inspector"><button onClick={()=>inspector.current?.close()}>Close inspector</button></dialog><p>{(read.data as {message:string}|undefined)?.message ?? "Loading example"}</p><Link to={["orders","42"]}>Open order 42</Link><button onClick={()=>props.navigation.openWorkspace({workspaceId:props.mount.id,subject:props.mount.subject,segments:["orders","42"],handoff:{kind:"example.order",payload:"Selected order context"}})}>Open order context</button></section></ConsoleActionScope></ConsolePageScope>;
}`
  );
  fs.writeFileSync(
    path.join(entry, "orders", "[id]", "page.tsx"),
    `import type {PageProps} from "@lenso/console-sdk";
import {ConsolePageScope} from "@lenso/console-react";
export default function Page(props:PageProps) {return <ConsolePageScope scopeKey={props.activation!.key} value={{context:{kind:"object",label:"Order",id:String(props.params.id),return:{label:"Return to orders",onInvoke:()=>props.navigation.go([])}}}}><section><h2>Order {props.params.id}</h2><p>{String(props.location.handoff?.payload ?? "")}</p></section></ConsolePageScope>;}`
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
  let admittedApp;
  let admittedServer;
  let authenticatedPreview;
  let previewApp;
  let previewBackendServer;
  const port = await freePort();
  try {
    for (const operation of ["check", "build"]) {
      execFileSync(
        "bun",
        [
          "run",
          "lenso-console-author",
          operation,
          "--entry",
          entry,
          "--plugin-id",
          "example.console",
        ],
        {
          cwd: root,
          stdio: "pipe",
        }
      );
    }
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
    const draft = page.getByRole("textbox", { name: "Order draft" });
    await draft.fill("Preserved draft");
    const shortcut = await page.evaluate(() =>
      /Mac|iPhone|iPad/u.test(navigator.platform) ? "Meta+k" : "Control+k"
    );
    await draft.press(shortcut);
    const search = page.getByRole("searchbox", { name: "Search commands" });
    await search.waitFor();
    assert.equal(
      await search.evaluate((node) => node === document.activeElement),
      true
    );
    await search.fill("Count order");
    await search.press("Enter");
    await page.getByLabel("Order count").filter({ hasText: "1" }).waitFor();
    assert.equal(await draft.inputValue(), "Preserved draft");
    await page.getByRole("button", { name: "Toggle count guard" }).click();
    await draft.press(shortcut);
    await search.waitFor();
    assert.equal(
      await page
        .getByRole("button", { exact: true, name: "Count order" })
        .isDisabled(),
      true
    );
    await search.press("Escape");
    assert.equal(
      await draft.evaluate((node) => node === document.activeElement),
      true
    );
    const link = page.getByRole("link", { name: "Open order 42" });
    await link.focus();
    await link.press("Enter");
    await page
      .getByRole("heading", { exact: true, name: "Order 42" })
      .waitFor();
    await page
      .getByRole("button", { exact: true, name: "Return to orders" })
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
    // Use the compiled Plugin and its exact mount, a real Auth owner and the
    // built production Shell. Preview source rendering cannot prove injection.
    const productionOrigin = `http://127.0.0.1:${await freePort()}`;
    const config = {
      apiBasePath: "/api",
      authBasePath: "/auth",
      databasePath: path.join(root, "unused.sqlite"),
      origin: productionOrigin,
      shellDirectory: path.resolve("plugins/console/shell/dist/client"),
      subject: "fixture@localhost.test",
      token: "isolated-admission-fixture-token",
    };
    const generated = await import(
      path.join(entry, ".lenso/console/plugin.ts")
    );
    const admittedMount = generated.createMount({
      basePath: "/orders",
      id: "orders",
      subject: { kind: "console" },
      targetId: "local",
      workspaceId: "example.console",
    });
    const shell = await createBuiltShell(config.shellDirectory, config);
    const startFixture = async (
      publicOrigin,
      listenerOrigin = publicOrigin
    ) => {
      const local = createLocalAuthentication({
        ...config,
        origin: publicOrigin,
      });
      const production = createConsolePlugin({
        authentication: local.authentication,
        binding: (_operation, _input, request) => ({
          context: {
            mountId: admittedMount.descriptor.id,
            owner: admittedMount.descriptor.owner,
            revision: admittedMount.descriptor.revision,
            signal: request.signal,
            subject: admittedMount.descriptor.subject,
          },
        }),
        management: true,
        shell: (request) =>
          new URL(request.url).pathname.startsWith("/orders")
            ? shell.fetch(new Request(`${publicOrigin}/`, request))
            : shell.fetch(request),
        shellMatches: (request) =>
          shell.matches(request) ||
          new URL(request.url).pathname.startsWith("/orders"),
        targets: [
          {
            id: "local",
            label: "Fixture application",
            manage: [generated.manage],
            mounts: [admittedMount],
            plugins: [generated.default],
            tenantId: "local",
          },
        ],
      });
      const app = await startApp({
        plugins: [
          local.source,
          local.authentication,
          generated.default,
          production,
        ],
      });
      const server = Bun.serve({
        // A deployment behind a trusted reverse proxy has one configured public
        // URL. URL/Host are mapped to that fixed deployment origin, never to a
        // caller-supplied forwarding header. Browser Origin and credentials stay exact.
        fetch: async (request) => {
          const headers = new Headers(request.headers);
          headers.set("host", new URL(publicOrigin).host);
          const external = new Request(request, { headers });
          return (
            (await app
              .get(production)
              .fetch(
                new Request(
                  new URL(
                    new URL(request.url).pathname + new URL(request.url).search,
                    publicOrigin
                  ),
                  external
                )
              )) ?? new Response(null, { status: 404 })
          );
        },
        hostname: "127.0.0.1",
        port: Number(new URL(listenerOrigin).port),
      });
      return { app, server };
    };
    ({ app: admittedApp, server: admittedServer } =
      await startFixture(productionOrigin));
    const productionPage = await browser.newPage();
    productionPage.on("pageerror", (error) => errors.push(error.message));
    await productionPage.goto(`${productionOrigin}/orders`);
    await productionPage
      .getByRole("heading", { exact: true, name: "Sign in to Console" })
      .waitFor();
    assert.equal(
      await productionPage
        .getByText("Real admitted data", { exact: true })
        .count(),
      0
    );
    const authenticate = (current) =>
      current.evaluate(
        async ({ subject, password }) => {
          const response = await fetch("/auth/methods");
          const methods = await response.json();
          const prefix = `${methods.csrf.cookie_name}=`;
          const csrf = document.cookie
            .split(";")
            .map((cookie) => cookie.trim())
            .find((cookie) => cookie.startsWith(prefix))
            ?.slice(prefix.length);
          const signedIn = await fetch("/auth/login", {
            body: JSON.stringify({ identifier: subject, password }),
            headers: {
              "content-type": "application/json",
              [methods.csrf.header_name]: csrf ?? "",
            },
            method: "POST",
          });
          return signedIn.status;
        },
        { password: config.token, subject: config.subject }
      );
    assert.equal(await authenticate(productionPage), 204);
    await productionPage.goto(`${productionOrigin}/orders`);
    await productionPage
      .getByText("Real admitted data", { exact: true })
      .waitFor();
    const productionDraft = productionPage.getByRole("textbox", {
      name: "Order draft",
    });
    await productionDraft.fill("Compiled draft");
    await productionDraft.press(shortcut);
    const productionSearch = productionPage.getByRole("searchbox", {
      name: "Search commands",
    });
    await productionSearch.waitFor();
    await productionSearch.fill("Count order");
    await productionSearch.press("Enter");
    await productionPage
      .getByLabel("Order count")
      .filter({ hasText: "1" })
      .waitFor();
    assert.equal(await productionDraft.inputValue(), "Compiled draft");
    await productionPage
      .getByRole("tab", { exact: true, name: "Order detail" })
      .click();
    await productionPage
      .getByRole("heading", { exact: true, name: "Order 42" })
      .waitFor();
    await productionPage
      .getByRole("button", { exact: true, name: "Return to orders" })
      .click();
    await productionPage
      .getByRole("heading", { exact: true, name: "Authored orders" })
      .waitFor();
    const exerciseSurface = async (current, hostName) => {
      await current.getByRole("button", { name: "Toggle context" }).click();
      assert.equal(
        await current.locator('[aria-label="Task context"]').count(),
        0
      );
      await current.getByRole("button", { name: "Toggle context" }).click();
      await current.getByRole("tab", { name: "Order detail" }).waitFor();
      await current.getByRole("button", { name: "Open inspector" }).click();
      await current
        .getByRole("button", { name: "Close inspector" })
        .press(shortcut);
      assert.equal(
        await current
          .getByRole("searchbox", { name: "Search commands" })
          .count(),
        0
      );
      await current
        .getByRole("button", { name: "Close inspector" })
        .press("Escape");
      await current
        .getByRole("button", { name: "Toggle selection" })
        .press("Enter");
      await current
        .getByRole("button", { exact: true, name: "Count selection" })
        .waitFor();
      await current
        .getByRole("textbox", { name: "Order draft" })
        .press(shortcut);
      await current
        .getByRole("searchbox", { name: "Search commands" })
        .press("Escape");
      await current
        .getByRole("button", { exact: true, name: "Count selection" })
        .click();
      await current
        .getByLabel("Order count")
        .filter({ hasText: "1" })
        .waitFor();
      await current.getByRole("button", { name: "Toggle selection" }).click();
      await current
        .getByRole("button", { exact: true, name: "Command" })
        .waitFor();
      for (const [width, theme, motion] of [
        [1280, "light", "no-preference"],
        [390, "dark", "reduce"],
      ]) {
        await current.setViewportSize({ height: 844, width });
        await current.emulateMedia({ reducedMotion: motion });
        await current.evaluate(
          (value) =>
            localStorage.setItem(
              "lenso-console:theme-preference",
              JSON.stringify(value)
            ),
          theme
        );
        await current.reload();
        await current
          .getByRole("heading", { exact: true, name: "Authored orders" })
          .waitFor();
        await current
          .getByRole("textbox", { name: "Order draft" })
          .press(shortcut);
        const surface = current.getByRole("dialog", {
          exact: true,
          name: "Command",
        });
        await surface.waitFor();
        const box = await surface.boundingBox();
        assert.ok(
          box &&
            box.x >= 0 &&
            box.x + box.width <= width &&
            box.y + box.height <= 844
        );
        assert.equal(
          await current.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        if (process.env.DELTA_SCRATCH_DIR) {
          await current.screenshot({
            path: path.join(
              process.env.DELTA_SCRATCH_DIR,
              `${hostName}-${width}-${theme}.png`
            ),
          });
        }
        await current
          .getByRole("searchbox", { name: "Search commands" })
          .press("Escape");
      }
    };
    await exerciseSurface(productionPage, "admitted");
    const backendPort = await freePort();
    const previewOrigin = `http://127.0.0.1:${backendPort}`;
    const rejectedOrigin = await productionPage.request.post(
      `${productionOrigin}/api/console/v2/rpc/workspace/invoke`,
      {
        data: {},
        headers: { origin: previewOrigin },
      }
    );
    assert.equal(
      rejectedOrigin.status(),
      403,
      "A different browser origin never gains backend invocation authority"
    );
    const internalOrigin = `http://127.0.0.1:${await freePort()}`;
    ({ app: previewApp, server: previewBackendServer } = await startFixture(
      previewOrigin,
      internalOrigin
    ));
    authenticatedPreview = await dev({
      backendUrl: internalOrigin,
      entry,
      port: backendPort,
    });
    // Loopback cookies span ports, and both hosts share the persistent session store.
    // Start this deployment's unauthenticated proof without the prior host's cookie.
    await productionPage.context().clearCookies();
    await productionPage.goto(`http://127.0.0.1:${backendPort}/orders`);
    await productionPage.getByRole("alert").waitFor();
    assert.equal(await authenticate(productionPage), 204);
    await productionPage.reload();
    await productionPage
      .getByText("Real admitted data", { exact: true })
      .waitFor({ timeout: 10_000 })
      .catch(async (error) => {
        throw new Error(
          `${await productionPage.locator("body").textContent()} ${JSON.stringify(errors)}`,
          { cause: error }
        );
      });
    await exerciseSurface(productionPage, "backend-preview");
    await productionPage
      .getByRole("tab", { exact: true, name: "Order detail" })
      .press("Enter");
    await productionPage
      .getByRole("heading", { exact: true, name: "Order 42" })
      .waitFor();
    await productionPage
      .getByRole("button", { exact: true, name: "Return to orders" })
      .press("Enter");
    await productionPage
      .getByRole("heading", { exact: true, name: "Authored orders" })
      .waitFor();
    const revoked = await productionPage.evaluate(async () => {
      const discoveryResponse = await fetch("/auth/methods");
      const discovery = await discoveryResponse.json();
      const prefix = `${discovery.csrf.cookie_name}=`;
      const csrf = document.cookie
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(prefix))
        ?.slice(prefix.length);
      const response = await fetch(discovery.session.logout, {
        headers: { [discovery.csrf.header_name]: csrf ?? "" },
        method: "POST",
      });
      return response.status;
    });
    assert.equal(revoked, 204);
    await productionPage.reload();
    await productionPage.getByRole("alert").waitFor();
    assert.equal(
      await productionPage.locator('[aria-label="Task context"]').count(),
      0
    );
    assert.equal(
      await productionPage
        .getByRole("button", { exact: true, name: "Command" })
        .count(),
      0
    );
    await productionPage.close();
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
    const retry = page.getByRole("button", {
      exact: true,
      name: "Retry admission",
    });
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
    await authenticatedPreview?.stop();
    await admittedServer?.stop(true);
    await admittedApp?.stop();
    await previewBackendServer?.stop(true);
    await previewApp?.stop();
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
