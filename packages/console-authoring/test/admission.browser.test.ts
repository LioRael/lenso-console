import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, webkit } from "playwright";

const loopback = process.env.LENSO_ADMISSION_LOOPBACK === "1";
const cookieName = loopback
  ? "lenso-local-synthetic-csrf"
  : "__Host-synthetic-csrf";

// Helper tests cannot prove hook recovery, WebKit's actual local HTTP cookie
// behavior, location.assign, or overlapping focus requests in a mounted app.
for (const engine of [
  process.env.LENSO_ADMISSION_BROWSER === "webkit" ? webkit : chromium,
]) {
  test(`${engine.name()}: minimal admission app restores deep links and recovers session reads`, async () => {
    const scratch = await mkdtemp(join(tmpdir(), "console-admission-"));
    let authenticated = false;
    let csrf = false;
    let unavailable = false;
    let now = 1_700_000_000_000;
    let expiresAt = now + 2 * 3_600_000;
    let sessionReads = 0;
    let passwordWrites = 0;
    const submittedCsrf: { value: string | null } = { value: null };
    const handoff: { returnTo: string | null } = { returnTo: null };
    let pending: Promise<void> | undefined;
    let release: (() => void) | undefined;
    let observed: (() => void) | undefined;
    let script = "";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/app.js") {
          return new Response(script, {
            headers: { "content-type": "text/javascript" },
          });
        }
        if (url.pathname === "/auth/methods") {
          return Response.json(
            {
              methods: [
                {
                  id: "sso",
                  kind: "redirect",
                  label: "Company account",
                  action: "/auth/company",
                },
                {
                  id: "password",
                  kind: "password",
                  label: "Password",
                  action: "/auth/login",
                },
              ],
              ...(csrf
                ? {
                    csrf: {
                      cookie_name: cookieName,
                      ...(loopback
                        ? { cookie_transport: "loopback-http" }
                        : {}),
                      header_name: "x-csrf-token",
                    },
                  }
                : {}),
            },
            {
              headers: csrf
                ? {
                    "set-cookie": `${cookieName}=synthetic; ${loopback ? "" : "Secure; "}Path=/; SameSite=Strict`,
                  }
                : {},
            }
          );
        }
        if (url.pathname === "/auth/company") {
          handoff.returnTo = url.searchParams.get("return_to");
          authenticated = true;
          return new Response(null, {
            status: 302,
            headers: { location: handoff.returnTo! },
          });
        }
        if (url.pathname === "/auth/login") {
          passwordWrites += 1;
          submittedCsrf.value = request.headers.get("x-csrf-token");
          return new Response(null, { status: 403 });
        }
        // This fixture models a server predating the combined admission endpoint.
        if (url.pathname === "/api/console/v1/admission") {
          return new Response(null, { status: 404 });
        }
        if (url.pathname === "/api/console/v1/session") {
          sessionReads += 1;
          observed?.();
          await pending;
          if (unavailable) {
            return new Response(null, { status: 503 });
          }
          if (!authenticated || now >= expiresAt) {
            return Response.json(
              { code: authenticated ? "session_expired" : "unauthenticated" },
              { status: 401 }
            );
          }
          return Response.json(
            {
              mode: "required",
              authenticated: true,
              subject: "synthetic",
              console_access: true,
              administrator: false,
              workspace_ids: [],
              assistant_enabled: false,
              human_management_enabled: false,
              management_enabled: false,
              management_protocol: "lenso-console-rpc/2",
              capabilities: {
                locale: "unavailable",
                pluginConfiguration: "read-only",
                pluginConfigurationWrite: {
                  available: false,
                  reason: "fixture",
                },
                agent: { available: false, reason: "fixture" },
              },
            },
            { headers: { "x-lenso-read-scope": "a".repeat(64) } }
          );
        }
        if (url.pathname === "/api/console/v1/pages") {
          return Response.json({
            schema: "console.page-catalog/1",
            mounts: [],
          });
        }
        return new Response(
          '<!doctype html><title>Minimal Console admission</title><main id="root"></main><script src="/app.js"></script>',
          { headers: { "content-type": "text/html" } }
        );
      },
    });
    const browser = await engine.launch({ headless: true });
    try {
      const entry = join(scratch, "app.tsx");
      await writeFile(
        entry,
        `
        import React from ${JSON.stringify(new URL(import.meta.resolve("react")).pathname)};
        import {createRoot} from ${JSON.stringify(new URL(import.meta.resolve("react-dom/client")).pathname)};
        import {useConsoleAdmission} from ${JSON.stringify(new URL("../src/browser-admission.ts", import.meta.url).pathname)};
        function App() {
          const session = useConsoleAdmission();
          return <><h1>Minimal Console admission</h1><p role="status">{session.state}</p>
            {session.actionError && <p role="alert">{session.actionError.message}</p>}
            <button onClick={() => session.retry()}>Retry session</button>
            <button disabled={session.busy || !session.discovery} onClick={() => session.redirect(session.discovery.methods[0])}>Company account</button>
            <button disabled={session.busy || !session.discovery} onClick={() => session.login(session.discovery.methods[1], {identifier:"synthetic",password:"synthetic"})}>Password</button>
          </>;
        }
        createRoot(document.getElementById('root')).render(<App/>);
      `
      );
      const bundle = await Bun.build({
        entrypoints: [entry],
        target: "browser",
        format: "iife",
        jsx: { runtime: "classic" },
      });
      if (!bundle.success) {
        throw new AggregateError(bundle.logs, "Admission app build failed");
      }
      script = await bundle.outputs[0]!.text();
      const context = await browser.newContext();
      let page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const destination = "/authorization/?filter=open#item";
      await page.goto(new URL(destination, server.url).href);
      await page
        .getByRole("status")
        .filter({ hasText: "unauthenticated" })
        .waitFor();
      await page.getByRole("button", { name: "Company account" }).focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("status")
        .filter({ hasText: /^authenticated$/ })
        .waitFor();
      expect(handoff.returnTo).toBe(destination);
      expect(
        new URL(page.url()).pathname +
          new URL(page.url()).search +
          new URL(page.url()).hash
      ).toBe(destination);
      expect(await page.title()).toBe("Minimal Console admission");

      // Closing the page and advancing only the synthetic owner clock must not
      // require a fresh login while its session remains valid.
      await page.close();
      now += 3_600_000;
      page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(new URL(destination, server.url).href);
      await page
        .getByRole("status")
        .filter({ hasText: /^authenticated$/ })
        .waitFor();
      const baseline = sessionReads;
      pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        observed = resolve;
      });
      await page.evaluate(() => {
        for (let index = 0; index < 8; index += 1) {
          window.dispatchEvent(new Event("focus"));
        }
      });
      await started;
      expect(sessionReads).toBe(baseline + 1);
      const completed = page.waitForResponse((response) =>
        response.url().endsWith("/console/v1/session")
      );
      release!();
      pending = undefined;
      await completed;
      await page.evaluate(
        () => new Promise((resolve) => setTimeout(resolve, 0))
      );
      expect(sessionReads).toBe(baseline + 1);
      // A later outage can be retried; single-flight state must not retain a rejected promise.
      unavailable = true;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page
        .getByRole("status")
        .filter({ hasText: "unavailable" })
        .waitFor();
      unavailable = false;
      await page.getByRole("button", { name: "Retry session" }).focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("status")
        .filter({ hasText: /^authenticated$/ })
        .waitFor();
      expiresAt = now;
      await page.close();
      page = await context.newPage();
      await page.goto(new URL(destination, server.url).href);
      await page.getByRole("status").filter({ hasText: "expired" }).waitFor();

      // Keep the real browser's Secure-cookie decision; never disable cookie policy.
      authenticated = false;
      csrf = true;
      await page.reload();
      await page
        .getByRole("status")
        .filter({ hasText: "unauthenticated" })
        .waitFor();
      const supported = await page.evaluate(
        (name) => ({
          cookie: document.cookie.includes(`${name}=`),
          locks: !!navigator.locks,
        }),
        cookieName
      );
      console.info(
        `${engine.name()} local HTTP: Secure CSRF cookie=${supported.cookie}, Web Locks=${supported.locks}`
      );
      // Chromium accepts Secure localhost cookies; explicitly losing this
      // fixture-owned cookie exercises the same recovery path there as well.
      if (loopback) {
        expect(supported.cookie).toBe(true);
        await page
          .getByRole("button", { name: "Password", exact: true })
          .click();
        await page.getByRole("alert").waitFor();
        expect(passwordWrites).toBe(1);
        expect(submittedCsrf.value).toBe("synthetic");
      }
      const writesBeforeMissingCookie = passwordWrites;
      await context.clearCookies({ name: cookieName });
      await page.getByRole("button", { name: "Password", exact: true }).click();
      await page.getByRole("alert").waitFor();
      expect(await page.getByRole("alert").textContent()).toContain(
        loopback ? "Reload" : "HTTPS"
      );
      expect(passwordWrites).toBe(writesBeforeMissingCookie);
      expect(errors).toEqual([]);
    } finally {
      release?.();
      await browser.close();
      await server.stop(true);
      await rm(scratch, { recursive: true, force: true });
    }
  }, 30_000);
}

// Ordinary logout tests do not queue a logout behind the renewal's exclusive
// status check, before that renewal broadcasts its identity transition.
test("a queued logout survives another tab's automatic renewal", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "console-logout-race-"));
  let authenticated = true;
  let renewals = 0;
  let logouts = 0;
  let statusReads = 0;
  let script = "";
  const heldStatus = Promise.withResolvers<undefined>();
  const statusStarted = Promise.withResolvers<undefined>();
  const heldLogout = Promise.withResolvers<undefined>();
  const logoutStarted = Promise.withResolvers<undefined>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const headers = {
        "cache-control": "no-store",
        "x-lenso-read-scope": "a".repeat(64),
      };
      if (pathname === "/app.js") {
        return new Response(script, {
          headers: { "content-type": "text/javascript" },
        });
      }
      if (pathname === "/auth/methods") {
        return Response.json({
          methods: [],
          session: {
            logout: "/auth/logout",
            ...(request.headers.get("referer")?.includes("tab=renew")
              ? { status: "/auth/status", renew: "/auth/renew" }
              : {}),
          },
        });
      }
      if (pathname === "/auth/status") {
        statusReads += 1;
        if (statusReads === 2) {
          statusStarted.resolve(undefined);
          await heldStatus.promise;
        }
        if (!authenticated) {
          return new Response(null, { status: 401, headers });
        }
        const now = Date.now();
        return Response.json({
          subjectId: "synthetic",
          serverNow: now,
          expiresAt: now + 3_600_000,
          absoluteExpiresAt: now + 7_200_000,
          renewAfterAt: now + (renewals ? 600_000 : -1),
        });
      }
      if (pathname === "/auth/renew") {
        renewals += 1;
        return new Response(null, { status: 204 });
      }
      if (pathname === "/auth/logout") {
        logouts += 1;
        authenticated = false;
        logoutStarted.resolve(undefined);
        await heldLogout.promise;
        return new Response(null, { status: 204 });
      }
      // This fixture models a server predating the combined admission endpoint.
      if (pathname === "/api/console/v1/admission") {
        return new Response(null, { status: 404 });
      }
      if (pathname === "/api/console/v1/session") {
        return retirementSession(authenticated);
      }
      if (pathname === "/api/console/v1/pages") {
        return Response.json(
          { schema: "console.page-catalog/1", mounts: [] },
          { headers }
        );
      }
      return new Response(
        '<!doctype html><title>Logout race fixture</title><div id="root"></div><script src="/app.js"></script>',
        { headers: { "content-type": "text/html" } }
      );
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    script = await buildRetirementFixture(scratch);
    const context = await browser.newContext();
    const first = await context.newPage();
    const second = await context.newPage();
    const errors: string[] = [];
    for (const page of [first, second]) {
      page.on("pageerror", (error) => errors.push(error.message));
    }
    await first.goto(new URL("/private?tab=logout", server.url).href);
    await first.getByText("Private synthetic page", { exact: true }).waitFor();
    await second.goto(new URL("/private?tab=renew", server.url).href);
    await statusStarted.promise;
    await first.getByRole("button", { name: "Logout", exact: true }).click();
    await first.waitForFunction(async () => {
      const locks = await navigator.locks.query();
      return locks.pending?.some(
        (lock) => lock.name === "lenso.identity-transition"
      );
    });
    heldStatus.resolve(undefined);
    // A cancelled queued operation never dispatches logout. Bound the wait so
    // the regression fails on that concrete omission, not a browser timeout.
    const dispatched = await Promise.race([
      logoutStarted.promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    expect(dispatched).toBe(true);
    expect(renewals).toBe(1);
    expect(await first.getByRole("status").textContent()).toBe("loading");
    expect(await first.getByText("Private synthetic page").count()).toBe(0);
    heldLogout.resolve(undefined);
    await first
      .getByRole("status")
      .filter({ hasText: /^unauthenticated$/ })
      .waitFor();
    await second
      .getByRole("status")
      .filter({ hasText: /^expired$/ })
      .waitFor();
    expect(logouts).toBe(1);
    expect(await first.getByText("Private synthetic page").count()).toBe(0);
    expect(await second.getByText("Private synthetic page").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    heldStatus.resolve(undefined);
    heldLogout.resolve(undefined);
    await browser.close();
    await server.stop(true);
    await rm(scratch, { recursive: true, force: true });
  }
}, 10_000);

// A normal history reload cannot catch a cached document briefly disclosing its
// former admission before queued storage/focus invalidation is processed.
test("back-forward cache restores a retired page before checking its session again", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "console-history-retirement-"));
  let authenticated = true;
  let sessionReads = 0;
  let script = "";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/app.js") {
        return new Response(script, {
          headers: { "content-type": "text/javascript" },
        });
      }
      if (pathname === "/auth/methods") {
        return Response.json({
          methods: [],
          session: { logout: "/auth/logout" },
        });
      }
      if (pathname === "/auth/logout") {
        authenticated = false;
        return new Response(null, { status: 204 });
      }
      // This fixture models a server predating the combined admission endpoint.
      if (pathname === "/api/console/v1/admission") {
        return new Response(null, { status: 404 });
      }
      if (pathname === "/api/console/v1/session") {
        sessionReads += 1;
        return retirementSession(authenticated);
      }
      if (pathname === "/api/console/v1/pages") {
        return Response.json({ schema: "console.page-catalog/1", mounts: [] });
      }
      return new Response(
        pathname === "/away"
          ? "<!doctype html><title>Away fixture</title><h1>Away</h1>"
          : '<!doctype html><title>Logout race fixture</title><div id="root"></div><script src="/app.js"></script>',
        { headers: { "content-type": "text/html" } }
      );
    },
  });
  // Playwright normally disables BFCache. Use its pinned full Chromium in
  // headless mode and retain normal browser caching behavior for this proof.
  const browser = await chromium.launch({
    headless: true,
    channel: "chromium",
    ignoreDefaultArgs: ["--disable-back-forward-cache"],
  });
  try {
    script = await buildRetirementFixture(scratch);
    const context = await browser.newContext();
    await context.addInitScript(() => {
      // Storage remains the supported fallback when BroadcastChannel is absent.
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: undefined,
      });
      const fixture = globalThis as unknown as {
        restoredText: string[];
      };
      fixture.restoredText = [];
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
          fixture.restoredText.push(document.body.textContent ?? "");
        }
      });
    });
    const first = await context.newPage();
    const second = await context.newPage();
    const errors: string[] = [];
    for (const page of [first, second]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(new URL("/private", server.url).href);
      await page.getByText("Private synthetic page", { exact: true }).waitFor();
    }
    await second.goto(new URL("/away", server.url).href);
    await first.getByRole("button", { name: "Logout", exact: true }).click();
    await first
      .getByRole("status")
      .filter({ hasText: /^unauthenticated$/ })
      .waitFor();
    let before = sessionReads;
    let rechecked = second.waitForResponse(
      (response) =>
        response.url().endsWith("/console/v1/session") &&
        response.status() === 401
    );
    await second.evaluate(() => history.back());
    await rechecked;
    await second
      .getByRole("status")
      .filter({ hasText: /^expired$/ })
      .waitFor();
    expect(sessionReads).toBeGreaterThan(before);
    expect(await second.getByText("Private synthetic page").count()).toBe(0);
    const restored = await second.evaluate(
      () => (globalThis as unknown as { restoredText: string[] }).restoredText
    );
    expect(restored).toHaveLength(1);
    expect(restored[0]).not.toContain("Private synthetic page");
    await second.evaluate(() => history.forward());
    await second.getByRole("heading", { name: "Away", exact: true }).waitFor();
    before = sessionReads;
    rechecked = second.waitForResponse(
      (response) =>
        response.url().endsWith("/console/v1/session") &&
        response.status() === 401
    );
    await second.evaluate(() => history.back());
    await rechecked;
    await second
      .getByRole("status")
      .filter({ hasText: /^expired$/ })
      .waitFor();
    await second.waitForFunction(
      () =>
        (globalThis as unknown as { restoredText: string[] }).restoredText
          .length === 2
    );
    // Even an already retired cached document rechecks the owner on each return.
    expect(sessionReads).toBeGreaterThan(before);
    expect(await second.getByText("Private synthetic page").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.stop(true);
    await rm(scratch, { recursive: true, force: true });
  }
}, 15_000);

function retirementSession(authenticated: boolean) {
  return Response.json(
    authenticated
      ? {
          mode: "required",
          authenticated: true,
          subject: "synthetic",
          console_access: true,
          administrator: false,
          workspace_ids: [],
          assistant_enabled: false,
          human_management_enabled: false,
          management_enabled: false,
          management_protocol: "lenso-console-rpc/2",
          capabilities: {
            locale: "unavailable",
            pluginConfiguration: "read-only",
            pluginConfigurationWrite: {
              available: false,
              reason: "fixture",
            },
            agent: { available: false, reason: "fixture" },
          },
        }
      : { code: "unauthenticated" },
    {
      status: authenticated ? 200 : 401,
      headers: {
        "cache-control": "no-store",
        "x-lenso-read-scope": "a".repeat(64),
      },
    }
  );
}

async function buildRetirementFixture(scratch: string) {
  const entry = join(scratch, "app.tsx");
  await writeFile(
    entry,
    `import React from ${JSON.stringify(new URL(import.meta.resolve("react")).pathname)};
      import {createRoot} from ${JSON.stringify(new URL(import.meta.resolve("react-dom/client")).pathname)};
      import {useConsoleAdmission} from ${JSON.stringify(new URL("../src/browser-admission.ts", import.meta.url).pathname)};
      function App() {
        const session = useConsoleAdmission();
        return <><h1>Logout race fixture</h1><p role="status">{session.state}</p>
          {session.admission && <p>Private synthetic page</p>}
          <button disabled={session.busy || !session.discovery} onClick={() => session.logout()}>Logout</button>
        </>;
      }
      createRoot(document.getElementById('root')).render(<App/>);`
  );
  const bundle = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
    jsx: { runtime: "classic" },
  });
  if (!bundle.success) {
    throw new AggregateError(bundle.logs, "Logout fixture build failed");
  }
  return bundle.outputs[0]!.text();
}
