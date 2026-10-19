import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

test("operation inspection is on demand, keyboard accessible, bounded and retires late results", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "console-operation-context-"));
  let script = "";
  let reads = 0;
  let release: (() => void) | undefined;
  let observed!: () => void;
  const secondRead = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const context = {
    schema: "console.page-operation-context/1",
    provenance: "admitted-declaration",
    availability: "unverified",
    page: {
      mountId: "orders",
      targetId: "north",
      revision: "1",
      implementationId: "a".repeat(64),
      ownerInstance: "orders-owner",
    },
    service: "orders",
    operations: [
      {
        name: "read",
        pluginId: "orders-owner",
        method: "orders.read",
        effect: "read",
        metadata: {
          source: { file: "src/orders.ts", line: 12 },
          retry: "safe",
          cancellation: "cooperative",
          destructive: false,
          outputDescription: "Order summary",
          outputContract: { availability: "unavailable" },
          errorContract: { availability: "unavailable" },
        },
      },
    ],
    nextOffset: null,
    runtime: {
      availability: "unavailable",
      reason: "runtime-binding-not-configured",
    },
    recentFailures: {
      availability: "unavailable",
      reason: "collector-not-configured",
    },
  };
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
      if (url.pathname === "/inspect") {
        reads += 1;
        if (reads === 2) {
          await new Promise<void>((resolve) => {
            release = resolve;
            observed();
          });
        }
        return Response.json(context);
      }
      return new Response(
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
        { headers: { "content-type": "text/html" } }
      );
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const entry = join(scratch, "app.tsx");
    await writeFile(
      entry,
      `
      import React from ${JSON.stringify(new URL(import.meta.resolve("react")).pathname)};
      import {createRoot} from ${JSON.stringify(new URL(import.meta.resolve("react-dom/client")).pathname)};
      import {WorkspaceScope} from ${JSON.stringify(new URL("../src/navigation.ts", import.meta.url).pathname)};
      import {WorkspaceOperationContext} from ${JSON.stringify(new URL("../src/operation-context.tsx", import.meta.url).pathname)};
      const lifetime = new AbortController();
      window.retire = () => lifetime.abort();
      window.completed = 0;
      const workspace = {mount:{id:"orders", revision:"1"},signal:lifetime.signal,services:{inspect:async () => { try { return await (await fetch('/inspect')).json(); } finally { window.completed += 1; } }}};
      createRoot(document.getElementById('root')).render(<React.StrictMode><WorkspaceScope value={workspace}><WorkspaceOperationContext service="orders" operation="read" /></WorkspaceScope></React.StrictMode>);
    `
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "iife",
      jsx: { runtime: "classic" },
    });
    expect(result.success).toBe(true);
    script = await result.outputs[0]!.text();
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.url.href);
    const button = page.getByRole("button", {
      name: "Inspect operation context",
    });
    await button.waitFor();
    expect(reads).toBe(0);
    expect(
      await button.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
        return hit === element || element.contains(hit);
      })
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await button.evaluate((element) => document.activeElement === element)
    ).toBe(true);
    await page.keyboard.press("Enter");
    await page.getByText("src/orders.ts:12").waitFor();
    expect(reads).toBe(1);
    expect(
      await page.getByText("Static declarations · unverified").count()
    ).toBe(1);
    expect(
      await page.getByText("Unavailable: no collector configured.").count()
    ).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await button.click();
    await secondRead;
    expect(reads).toBe(2);
    await page.evaluate(() =>
      (window as unknown as { retire(): void }).retire()
    );
    release?.();
    await page.waitForFunction(
      () => (window as unknown as { completed: number }).completed === 2
    );
    await page.getByText("src/orders.ts:12").waitFor({ state: "detached" });
    expect(await page.getByRole("article").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    release?.();
    await browser.close();
    await server.stop(true);
    await rm(scratch, { recursive: true, force: true });
  }
}, 30000);
