#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runConsolePackageCli } from "@lenso/console-package-cli";
import {
  defineRemoteModule,
  defineSchemaEntity,
  getRoute,
  runtimeFunction,
  schemaAdmin,
  serveRemoteModule,
  textField,
  timestampField,
} from "@lenso/remote-module-kit";

const writeFixture = async (root, relativePath, contents) => {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
};

const createHostFixture = async (hostRoot) => {
  await writeFixture(
    hostRoot,
    "apps/runtime-console/package.json",
    JSON.stringify(
      {
        dependencies: {
          "@lenso/runtime-console-api": "workspace:*",
        },
        scripts: {
          test: "vitest run src packages/console-package-api/src",
        },
      },
      null,
      2
    )
  );
  await writeFixture(hostRoot, ".env", "APP_ENV=local\n");
  await writeFixture(
    hostRoot,
    "apps/runtime-console/src/console-package-manifest-exports.ts",
    "export const consolePackageManifests = [] as const;\n"
  );
  await writeFixture(
    hostRoot,
    "apps/runtime-console/src/console-package-module-exports.ts",
    `import type { ConsolePackageModuleExportsByKey } from "./app/console-package-registry";

export const consolePackageModuleExportsByKey = {} satisfies ConsolePackageModuleExportsByKey;
`
  );
};

const assertContains = (value, expected, label) => {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include ${expected}`);
  }
};

const greetings = [
  {
    id: "greeting_1",
    message: "Hello from a remote Lenso module.",
    recipient: "release-candidate",
    sent_at: "2026-06-08T00:00:00Z",
  },
];

const manifest = defineRemoteModule({
  admin: schemaAdmin([
    defineSchemaEntity({
      fields: [
        textField("id", { label: "ID" }),
        textField("recipient", { label: "Recipient" }),
        textField("message", { label: "Message" }),
        timestampField("sent_at", { label: "Sent At" }),
      ],
      label: "Greetings",
      name: "greetings",
      readCapability: "hello-action:greetings:read",
    }),
  ]),
  capabilities: ["hello-action:greetings:read", "hello-action:hello:read"],
  httpRoutes: [
    getRoute("/hello/{name}", {
      capability: "hello-action:hello:read",
      displayName: "Say hello",
      storyTitle: "Hello action request",
    }),
  ],
  name: "hello-action",
  runtimeFunctions: [
    runtimeFunction("hello-action.say-hello.v1", {
      queue: "hello-action",
    }),
  ],
  version: "0.1.0",
});

const sayHello = (name) => ({
  message: `Hello, ${name || "Lenso"}.`,
  module: manifest.name,
});

const serveHelloActionModule = (options = {}) =>
  serveRemoteModule(manifest, {
    data: {
      greetings: {
        detail: (id) => greetings.find((greeting) => greeting.id === id),
        list: () => ({
          next_cursor: null,
          records: greetings,
        }),
      },
    },
    http: {
      "GET /hello/{name}": ({ params }) => sayHello(params.name),
    },
    onReady: options.onReady,
    port: options.port ?? 4100,
    runtime: {
      "hello-action.say-hello.v1": ({ input }) =>
        sayHello(input?.name ?? "runtime"),
    },
  });

const smokeHelloActionModule = async (server) => {
  const loadedManifest = await fetch(server.manifestUrl).then((response) =>
    response.json()
  );
  if (loadedManifest.name !== "hello-action") {
    throw new Error("manifest did not return hello-action");
  }
  const admin = await fetch(`${server.baseUrl}/admin/greetings`).then(
    (response) => response.json()
  );
  if (admin.records?.[0]?.recipient !== "release-candidate") {
    throw new Error("schema-admin list endpoint did not return greetings");
  }
  const http = await fetch(`${server.baseUrl}/hello/release-candidate`).then(
    (response) => response.json()
  );
  if (http.message !== "Hello, release-candidate.") {
    throw new Error("HTTP route endpoint did not return greeting");
  }
  const runtime = await fetch(
    `${server.baseUrl}/runtime/functions/hello-action.say-hello.v1/invoke`,
    {
      body: JSON.stringify({
        actor: { id: "release-demo", kind: "service", scopes: [] },
        attempt: 1,
        correlation_id: "corr_release_demo",
        function_name: "hello-action.say-hello.v1",
        function_run_id: "fnrun_release_demo",
        input: { name: "release-demo" },
        request_id: "req_release_demo",
        trace: { span_id: "span_release_demo", trace_id: "trace_release_demo" },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  ).then((response) => response.json());
  if (runtime.output?.message !== "Hello, release-demo.") {
    throw new Error("runtime function endpoint did not return greeting");
  }
};

const main = async () => {
  const demoRoot = await mkdtemp(path.join(os.tmpdir(), "lenso-release-demo-"));
  const server = await serveHelloActionModule({ port: 0 });

  try {
    await smokeHelloActionModule(server);

    const hostRoot = path.join(demoRoot, "host");
    await createHostFixture(hostRoot);

    await runConsolePackageCli([
      "module",
      "add",
      server.manifestUrl,
      "--repo-root",
      hostRoot,
    ]);
    await runConsolePackageCli([
      "console-package",
      "apply-plan",
      "--repo-root",
      hostRoot,
    ]);

    const moduleBaseUrl = server.manifestUrl.slice(0, -"/manifest".length);
    const envFile = await readFile(path.join(hostRoot, ".env"), "utf-8");
    assertContains(
      envFile,
      `REMOTE_MODULES=hello-action=${moduleBaseUrl}`,
      ".env"
    );

    const installPlan = await readFile(
      path.join(hostRoot, ".lenso/console-package-install-plan.json"),
      "utf-8"
    );
    assertContains(installPlan, '"moduleName": "hello-action"', "install plan");

    console.log("Release demo passed");
    console.log(`Manifest URL: ${server.manifestUrl}`);
    console.log(`Install command: lenso module add ${server.manifestUrl}`);
  } finally {
    await server.close();
    if (!process.env.LENSO_KEEP_RELEASE_DEMO) {
      await rm(demoRoot, { force: true, recursive: true });
    }
  }
};

await main();
