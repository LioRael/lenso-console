import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import {
  createConsolePlugin,
  type ConsoleResource,
  type ConsoleMount,
  type ConsoleService,
} from "@lenso/console";
import { createConsoleWorkspaceServices } from "@lenso/console-sdk/transport";
import { createConsoleAuthentication } from "@lenso/console/auth";
import {
  createConsoleDevOperationInspector,
  combineConsoleOperationInspectors,
} from "@lenso/console/dev-context";
import { definePlugin, startApp, type Plugin } from "@lenso/core";
import { defineOperation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { RuntimeHost } from "@lenso/runtime-sdk";
import { startRuntimeCompanions } from "@lenso/runtime/engine";
import { z } from "zod";

import { freePort } from "../../../examples/ts-console/test/port";
import {
  startGreetingFixture,
  writeGreetingManifest,
} from "../../../examples/ts-console/test/runtime-greeting";
import {
  createConsoleOperationContextTools,
  registerConsoleOperationContext,
} from "../../agent-console/src/context-tools";
import {
  createConsoleRuntimeInspection,
  createConsoleRuntimeOperationInspector,
} from "../src/server";
import { startDevContextFixture } from "./dev-context-fixture";

// Opt-in native test: uses the already prepared pinned kernel; never starts the user's runtime.
const nativeTest =
  process.env.LENSO_CONTEXT_NATIVE === "1" ||
  process.env.LENSO_REQUIRE_RUNTIME === "1"
    ? test
    : test.skip;
nativeTest(
  "page and Agent inspect the same native Runtime generation through exact admitted operation bindings",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "console-page-native-"));
    const cleanup: (() => Promise<void>)[] = [];
    let wire: ConsoleService | undefined;
    let browserScript = "";
    let browserCss = "";
    const http = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/app.css") {
          return new Response(browserCss, {
            headers: { "content-type": "text/css" },
          });
        }
        if (path === "/app.js") {
          return new Response(browserScript, {
            headers: { "content-type": "text/javascript" },
          });
        }
        if (path.startsWith("/api/")) {
          return (
            (await wire?.fetch(request)) ?? new Response(null, { status: 503 })
          );
        }
        return new Response(
          '<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0;padding:16px"><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
          { headers: { "content-type": "text/html" } }
        );
      },
    });
    const { origin } = http.url;
    const port = await freePort();
    let greeting: RuntimeHost | undefined;
    let probe: RuntimeHost | undefined;
    let running: Awaited<ReturnType<typeof startApp>> | undefined;
    const useScopedAuth = process.env.LENSO_CONTEXT_SCOPED_AUTH === "1";
    let verifications = 0;
    let runtimeStatusReads = 0;
    let devReads = 0;
    let corruptGeneration = false;
    const auth = createAuth(
      realm(
        "fixture",
        defineSource({
          capabilities: { authoritative: true },
          verify: async (token: string | null) => {
            verifications += 1;
            return token === "synthetic"
              ? {
                  status: "verified",
                  subjectId: "alice",
                  kind: "user",
                  session: {
                    authoritative: true,
                    expiresAt: Date.now() + 60000,
                  },
                }
              : { status: "rejected" };
          },
        })
      )
    );
    let allowed = true;
    let administrator = true;
    try {
      await startRuntimeCompanions(
        {
          port,
          kernelBinary: new URL(
            "../../../.runtime-deps/runtime-target/debug/lenso-runtime",
            import.meta.url
          ).pathname,
          services: [],
        },
        (dispose) => cleanup.push(dispose)
      );
      greeting = await startGreetingFixture(port);
      probe = await RuntimeHost.connect({
        namespace: "console-demo",
        service: "page-inspector",
        instance: "synthetic-probe",
        port,
        contract: { version: "1", methods: {} },
      });
      const originalStatus = probe.status.bind(probe);
      probe.status = async (options) => {
        runtimeStatusReads += 1;
        return originalStatus(options);
      };
      const access = auth
        .for(audience("console"))
        .memberships(async (_actor, resource: ConsoleResource) =>
          resource.tenantId === "north" ? {} : null
        );
      const authentication = createConsoleAuthentication({
        access,
        policy: () => allowed,
        requestPolicy: { origin, credentialMode: "bearer" },
        evidence: (request) =>
          request.headers.get("authorization")?.slice(7) ?? null,
        permissionRevision: () => "1",
        session: () => ({ administrator, workspace_ids: ["orders"] }),
        sessionRead: async (_actor, { signal, scope }) => {
          await access.enforceRead!(
            scope.authenticationScope as Parameters<
              NonNullable<typeof access.enforceRead>
            >[0],
            Object.freeze({
              action: "session" as const,
              targetId: "north",
              tenantId: "north",
            }),
            () => administrator,
            { signal }
          );
          return { administrator, workspace_ids: ["orders"] };
        },
      });
      const authenticationPlugin = definePlugin({
        id: "auth",
        setup: () => authentication,
      });
      const runtime = definePlugin({
        id: "runtime",
        setup: () => ({ host: probe!, clients: undefined }),
      });
      const manifestPath = join(directory, "manifest.json");
      await writeGreetingManifest(manifestPath);
      const inspection = createConsoleRuntimeInspection({
        id: "runtime-inspection",
        runtime,
        authentication: authenticationPlugin,
        targetId: "north",
        tenantId: "north",
        manifestPath,
        readScope: useScopedAuth,
      });
      const owner = definePlugin({
        id: "orders-owner",
        setup: () => ({ read: async () => ({}) }),
      });
      const operation = defineOperation({
        plugin: owner,
        method: "read",
        input: z.object({}),
        effect: "read",
        source: { file: "src/orders.ts", line: 12 },
        description: "Read orders",
        retry: "safe",
      });
      const manage = defineManage({ plugin: owner, operations: [operation] });
      const mount: ConsoleMount = {
        descriptor: {
          apiMajor: 1,
          id: "orders",
          title: "Orders",
          subject: { kind: "console" },
          owner: { instance: owner.id, source: "application", trusted: true },
          revision: "1",
          implementationId: "a".repeat(64),
          module: `/api/console/v1/pages/orders/assets/${"a".repeat(
            64
          )}/page.mjs`,
          styles: [],
          navigation: { label: "Orders", items: [] },
          requirements: [
            {
              service_id: "orders",
              capability_id: "orders",
              descriptor_version: "1",
              operations: ["list"],
              available: true,
              required: true,
              source: "owner",
            },
          ],
        },
        services: {
          orders: {
            manage,
            operations: [operation],
            operationAliases: { list: "read" },
          },
        },
        asset: async () => undefined,
      };
      const bridge = createConsoleRuntimeOperationInspector({
        id: "operation-inspection",
        inspection: inspection.plugin,
        bindings: [
          {
            targetId: "north",
            mountId: "orders",
            revision: "1",
            serviceId: "orders",
            operationName: "list",
            ownerPluginId: owner.id,
            ownerMethod: "read",
            namespace: "console-demo",
            service: "greeting",
            method: "greet",
            contractVersion: "1",
          },
        ],
      });
      let operationInspector = bridge;
      let devPlugins: Plugin<unknown>[] = [];
      const tsRoot = process.env.LENSO_CONTEXT_TS_ROOT;
      const tsNative = process.env.LENSO_CONTEXT_TS_NATIVE;
      if (tsRoot && tsNative) {
        const dev = await startDevContextFixture(tsRoot, tsNative);
        cleanup.push(async () => {
          await dev.close();
        });
        const connection = definePlugin({
          id: "dev-context-connection",
          setup: () => ({
            read: async (
              action: "inspect" | "recent",
              options: {
                generation?: string;
                pluginId?: string;
                method?: string;
                limit?: number;
                signal: AbortSignal;
              }
            ) => {
              devReads += 1;
              const value = await dev.read(action, options);
              if (corruptGeneration && action === "recent") {
                const invalid = structuredClone(value) as {
                  calls: { generation: string }[];
                };
                for (const row of invalid.calls) {
                  row.generation = "unrelated-generation";
                }
                return invalid;
              }
              return value;
            },
          }),
        });
        const development = createConsoleDevOperationInspector({
          id: "dev-operation-inspection",
          authentication: authenticationPlugin,
          connection,
          bindings: [
            {
              targetId: "north",
              mountId: "orders",
              revision: "1",
              service: "orders",
              name: "list",
              ownerPluginId: owner.id,
              ownerMethod: "read",
              devPluginId: "orders-owner",
              devMethod: "read",
            },
          ],
        });
        operationInspector = combineConsoleOperationInspectors({
          id: "combined-operation-inspection",
          inspectors: [bridge, development],
        });
        devPlugins = [connection, development, operationInspector];
      }
      const consolePlugin = createConsolePlugin({
        authentication: authenticationPlugin,
        management: true,
        operationInspection: operationInspector,
        targets: [
          {
            id: "north",
            label: "North",
            tenantId: "north",
            plugins: [owner],
            manage: [manage],
            mounts: [mount],
          },
        ],
        binding: () => ({}),
      });
      running = await startApp({
        plugins: [
          authenticationPlugin,
          runtime,
          inspection.plugin,
          bridge,
          ...devPlugins,
          owner,
          consolePlugin,
        ],
      });
      const service = running.get(consolePlugin);
      wire = service;
      let requests = 0;
      const services = createConsoleWorkspaceServices({
        mount: mount.descriptor,
        origin,
        headers: { authorization: "Bearer synthetic" },
        expectedSubject: "alice",
        fetch: async (url, init) => {
          requests += 1;
          return fetch(url, init);
        },
      });
      const beforeVerifications = verifications;
      const beforeRuntimeReads = runtimeStatusReads;
      const beforeDevReads = devReads;
      const queryStarted = performance.now();
      const page = await services.inspect!("orders", { operation: "list" });
      const queryMeasurement = {
        scopedRuntime: useScopedAuth,
        verifications: verifications - beforeVerifications,
        elapsedMs: performance.now() - queryStarted,
        httpRequests: requests,
        runtimeTCPStatusReads: runtimeStatusReads - beforeRuntimeReads,
        devUnixSocketReads: devReads - beforeDevReads,
      };
      console.info(
        JSON.stringify({
          measurement: "native-page-context",
          ...queryMeasurement,
        })
      );
      expect(queryMeasurement.runtimeTCPStatusReads).toBe(1);
      expect(queryMeasurement.devUnixSocketReads).toBe(
        tsRoot && tsNative ? 3 : 0
      );
      const fact = page.operations[0]!;
      expect(fact.method).toBe("read");
      expect(fact.metadata.source).toEqual({ file: "src/orders.ts", line: 12 });
      expect(fact.inspection?.runtime.availability).toBe("measured");
      if (fact.inspection?.runtime.availability !== "measured") {
        throw new Error("Missing measured Runtime");
      }
      expect(fact.inspection.runtime.instances).toHaveLength(1);
      expect(fact.inspection.runtime.instances[0]!.id).toBe("synthetic-one");
      expect(
        fact.inspection.runtime.instances[0]!.generation.length
      ).toBeGreaterThan(0);
      expect(fact.inspection.runtime.declaration.availability).toBe(
        "unverified"
      );
      if (tsRoot && tsNative) {
        expect(fact.inspection.recentFailures.availability).toBe("available");
        if (fact.inspection.recentFailures.availability !== "available") {
          throw new Error("Collector unavailable");
        }
        expect(fact.inspection.recentFailures.references).toHaveLength(1);
        expect(fact.inspection.recentFailures.references[0]!.code).toBe(
          "invalid-output"
        );
        expect(fact.inspection.recentFailures.references[0]!.effectState).toBe(
          "unknown"
        );
        expect(fact.inspection.execution?.outputSchemaAvailability).toBe(
          "available"
        );
        expect(fact.inspection.execution?.operationSource).toEqual(
          fact.metadata.source
        );
        expect(JSON.stringify(page)).not.toContain("private-output-value");
      } else {
        expect(fact.inspection.recentFailures.availability).toBe("unavailable");
      }
      expect(requests).toBe(1);
      let scopeKey = "project:north:alice:1";
      const tools = createConsoleOperationContextTools({
        resolve: async (
          _context: unknown,
          identity: { subject: string; scope: string }
        ) =>
          identity.subject === "alice" && identity.scope === "north"
            ? {
                scopeKey,
                application: "test",
                mount: {
                  ...mount.descriptor,
                  targetId: "north",
                  protocol: "lenso-console-rpc/2" as const,
                },
                services,
              }
            : undefined,
      });
      const identity = { subject: "alice", scope: "north" };
      const { signal } = new AbortController();
      const profile = registerConsoleOperationContext(
        {
          id: "operator",
          instructions: "Existing host instructions",
          tools: ["orders_read"],
          context: async () => [
            { source: "host", text: "Existing host context" },
          ],
        },
        tools
      );
      expect(profile.tools).toEqual([
        "orders_read",
        "console_page_operation_context",
      ]);
      const profileParts = await profile.context({}, identity, signal);
      expect(profileParts.map((part) => part.source)).toEqual([
        "host",
        "console.page",
      ]);
      const definitions = await tools.catalog({}, identity, signal);
      expect(definitions.map((entry) => entry.name)).toEqual([
        "console_page_operation_context",
      ]);
      const prepared = await tools.prepare(
        definitions[0]!.name,
        { service: "orders", operation: "list" },
        {},
        identity,
        signal
      );
      const agent = await tools.invoke(prepared, {}, identity, signal, false);
      // Duration and measured metadata remain stable for the same retained invocation.
      expect(agent).toEqual(page);
      expect(requests).toBe(2);
      scopeKey = "project:north:alice:2";
      await expect(
        tools.invoke(prepared, {}, identity, signal, false)
      ).rejects.toThrow("Console operation context is unavailable.");
      expect(requests).toBe(2);
      await expect(
        tools.prepare(
          definitions[0]!.name,
          { service: "orders", mountId: "elsewhere" },
          {},
          identity,
          signal
        )
      ).rejects.toThrow();
      if (tsRoot && tsNative) {
        corruptGeneration = true;
        await expect(
          services.inspect!("orders", { operation: "list" })
        ).rejects.toMatchObject({ code: "CONFLICT" });
        corruptGeneration = false;
      }
      if (process.env.LENSO_CONTEXT_BROWSER === "1") {
        const entry = join(directory, "app.tsx");
        await writeFile(
          entry,
          `import ${JSON.stringify(Bun.resolveSync("@lenso/tokens/styles.css", new URL("../../console-react", import.meta.url).pathname))};import ${JSON.stringify(new URL("../../console-react/dist/styles.css", import.meta.url).pathname)};import ${JSON.stringify(new URL("../../../plugins/console/shell/src/styles.css", import.meta.url).pathname)};import React from ${JSON.stringify(new URL(import.meta.resolve("react")).pathname)};import {createRoot} from ${JSON.stringify(new URL(import.meta.resolve("react-dom/client")).pathname)};import {WorkspaceScope} from ${JSON.stringify(new URL("../../console-authoring/src/navigation.ts", import.meta.url).pathname)};import {WorkspaceOperationContext} from ${JSON.stringify(new URL("../../console-authoring/src/operation-context.tsx", import.meta.url).pathname)};import {createConsoleWorkspaceServices} from ${JSON.stringify(new URL(import.meta.resolve("@lenso/console-sdk/transport")).pathname)};const mount=${JSON.stringify(mount.descriptor)};const workspace={mount,signal:new AbortController().signal,services:createConsoleWorkspaceServices({mount,headers:{authorization:'Bearer synthetic'},expectedSubject:'alice'})};createRoot(document.getElementById('root')).render(<WorkspaceScope value={workspace}><WorkspaceOperationContext service="orders" operation="list"/></WorkspaceScope>);`
        );
        const { build } = await import("vite");
        const { default: react } = await import("@vitejs/plugin-react");
        const { consoleStylex } =
          await import("../../../plugins/console/shell/config/console-stylex");
        const result = await build({
          configFile: false,
          root: import.meta.dir,
          plugins: [react(), consoleStylex()],
          logLevel: "error",
          oxc: { jsx: { development: false } },
          define: { "process.env.NODE_ENV": JSON.stringify("production") },
          resolve: {
            dedupe: ["react", "react-dom"],
            alias: {
              react: new URL(".", import.meta.resolve("react")).pathname,
              "react-dom": new URL(".", import.meta.resolve("react-dom/client"))
                .pathname,
            },
          },
          build: {
            write: false,
            minify: false,
            cssCodeSplit: false,
            lib: { entry, formats: ["es"] },
            rollupOptions: { output: { codeSplitting: false } },
          },
        });
        const output = Array.isArray(result) ? result[0] : result;
        if (!output || !("output" in output)) {
          throw new Error("Unexpected Vite output");
        }
        browserScript = output.output
          .filter((item) => item.type === "chunk")
          .map((item) => item.code)
          .join("\n");
        browserCss = output.output
          .filter(
            (item) => item.type === "asset" && item.fileName.endsWith(".css")
          )
          .map((item) => ("source" in item ? String(item.source) : ""))
          .join("\n");
        expect(browserCss.length).toBeGreaterThan(1000);
        const { chromium } = await import("playwright");
        const browser = await chromium.launch({
          headless: true,
          timeout: 8000,
        });
        try {
          const view = await browser.newPage({
            viewport: { width: 390, height: 844 },
          });
          const errors: string[] = [];
          view.on("pageerror", (error) => errors.push(error.message));
          view.setDefaultTimeout(5000);
          await view.goto(origin);
          try {
            await view
              .getByRole("button", { name: "Inspect operation context" })
              .waitFor();
          } catch {
            throw new Error(`Reader did not mount: ${errors.join("; ")}`);
          }
          await view.keyboard.press("Tab");
          await view.keyboard.press("Enter");
          await view.getByText("src/orders.ts:12").waitFor();
          const text = await view.locator("body").textContent();
          expect(text).toContain(
            fact.inspection.runtime.instances[0]!.generation
          );
          if (fact.inspection.recentFailures.availability === "available") {
            expect(text).toContain(
              fact.inspection.recentFailures.references[0]!.id
            );
            expect(text).toContain("invalid-output");
            expect(text).not.toContain("private-output-value");
          }
          expect(
            await view.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            )
          ).toBe(true);
          expect(errors).toEqual([]);
          if (process.env.LENSO_CONTEXT_PROOF) {
            await view.screenshot({
              path: process.env.LENSO_CONTEXT_PROOF,
              fullPage: true,
            });
            await writeFile(
              `${process.env.LENSO_CONTEXT_PROOF}.json`,
              JSON.stringify(
                { page, agent, browserText: text, paidCalls: 0 },
                null,
                2
              )
            );
          }
        } finally {
          await browser.close();
        }
      }
      administrator = false;
      await expect(
        services.inspect!("orders", { operation: "list" })
      ).rejects.toThrow();
      administrator = true;
      allowed = false;
      await expect(
        services.inspect!("orders", { operation: "list" })
      ).rejects.toThrow();
    } finally {
      await http.stop(true);
      await running?.stop();
      probe?.close();
      greeting?.close();
      while (cleanup.length) {
        await cleanup.pop()!();
      }
      await auth.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000
);
