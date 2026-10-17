import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, webkit } from "playwright";

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
    let returnTo: string | null = null;
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
                      cookie_name: "__Host-synthetic-csrf",
                      header_name: "x-csrf-token",
                    },
                  }
                : {}),
            },
            {
              headers: csrf
                ? {
                    "set-cookie":
                      "__Host-synthetic-csrf=synthetic; Secure; Path=/; SameSite=Strict",
                  }
                : {},
            }
          );
        }
        if (url.pathname === "/auth/company") {
          returnTo = url.searchParams.get("return_to");
          authenticated = true;
          return new Response(null, {
            status: 302,
            headers: { location: returnTo! },
          });
        }
        if (url.pathname === "/auth/login") {
          passwordWrites += 1;
          return new Response(null, { status: 403 });
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
      expect(returnTo).toBe(destination);
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
      const supported = await page.evaluate(() => ({
        cookie: document.cookie.includes("__Host-synthetic-csrf="),
        locks: !!navigator.locks,
      }));
      console.info(
        `${engine.name()} local HTTP: Secure CSRF cookie=${supported.cookie}, Web Locks=${supported.locks}`
      );
      // Chromium accepts Secure localhost cookies; explicitly losing this
      // fixture-owned cookie exercises the same recovery path there as well.
      await context.clearCookies({ name: "__Host-synthetic-csrf" });
      await page.getByRole("button", { name: "Password", exact: true }).click();
      await page.getByRole("alert").waitFor();
      expect(await page.getByRole("alert").textContent()).toContain("HTTPS");
      expect(passwordWrites).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      release?.();
      await browser.close();
      await server.stop(true);
      await rm(scratch, { recursive: true, force: true });
    }
  }, 30_000);
}
