import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temp = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "console-candidate-archives-"))
);
try {
  const pack = (directory, name) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, directory, "package.json"), "utf-8")
    );
    assert.equal(manifest.name, name);
    const filename = path.join(
      temp,
      `${name.replace("/", "-").replace("@", "")}-${manifest.version}.tgz`
    );
    execFileSync(
      "bun",
      ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", filename],
      {
        cwd: path.join(root, directory),
        encoding: "utf-8",
      }
    );
    const resolved = fs.realpathSync(filename);
    assert.ok(resolved.startsWith(temp + path.sep));
    assert.ok(fs.statSync(resolved).isFile());
    return resolved;
  };
  const env = {
    ...process.env,
    LENSO_AUTHOR_ARCHIVE: pack(
      "packages/console-authoring",
      "@lenso/console-sdk"
    ),
    LENSO_CONSOLE_ARCHIVE: pack("packages/console", "@lenso/console"),
  };
  // New optional packages need a clean consumer proof, not workspace resolution.
  const consumer = path.join(temp, "composition-consumer");
  fs.mkdirSync(consumer);
  const dependencies = {
    "@lenso/audit": "0.3.3",
    "@lenso/auth": "0.5.2",
    "@lenso/auth-console": pack("packages/auth-console", "@lenso/auth-console"),
    "@lenso/console-dashboard": pack(
      "packages/console-dashboard",
      "@lenso/console-dashboard"
    ),
    "@lenso/console-plugin-manager": pack(
      "packages/console-plugin-manager",
      "@lenso/console-plugin-manager"
    ),
    "@lenso/console-react": pack(
      "packages/console-react",
      "@lenso/console-react"
    ),
    "@lenso/console-sdk": env.LENSO_AUTHOR_ARCHIVE,
    "@lenso/core": "0.3.1",
    "@types/bun": "1.4.3",
    "@types/react": "^19.2.18",
    react: "19.2.8",
    "react-dom": "19.2.8",
    typescript: "7.0.2",
  };
  fs.writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({
      dependencies,
      name: "console-composition-archive-proof",
      private: true,
      type: "module",
    })
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    {
      cwd: consumer,
      stdio: "inherit",
    }
  );
  fs.writeFileSync(
    path.join(consumer, "browser.ts"),
    `
import * as shell from "@lenso/console-react";
import * as dashboard from "@lenso/console-dashboard/react";
import * as plugins from "@lenso/console-plugin-manager/react";
import * as auth from "@lenso/auth-console/react";
import * as administration from "@lenso/auth-console/administration/react";
import type { AuthConsoleClient } from "@lenso/auth-console/client";
import type { AdministrationClient, AdministrationAction, ConsoleAdministrationStore } from "@lenso/auth-console/administration/server";
import type { DashboardStore } from "@lenso/console-dashboard";
export const publicModules = { shell, dashboard, plugins, auth };
export const administrationPages = [administration.IdentityPage, administration.AccessPage, administration.AgentPage];
export type Clients = { auth: AuthConsoleClient; dashboard: DashboardStore; administration: AdministrationClient; store: ConsoleAdministrationStore; action: AdministrationAction };
`
  );
  execFileSync(
    "bun",
    [
      "run",
      "--bun",
      "tsc",
      "--noEmit",
      "--ignoreConfig",
      "--strict",
      "--skipLibCheck",
      "--module",
      "preserve",
      "--moduleResolution",
      "bundler",
      "--target",
      "esnext",
      "browser.ts",
    ],
    { cwd: consumer, stdio: "inherit" }
  );
  fs.writeFileSync(
    path.join(consumer, "verify.mjs"),
    `
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { ConsoleShell } from "@lenso/console-react";
import { createSqliteDashboardRepository, initializeSqliteDashboardSchema } from "@lenso/console-dashboard/server/sqlite";
import { createAuthConsoleServer } from "@lenso/auth-console/server";
import { createConsoleAdministration, createConsoleAdministrationStore, administrationActions } from "@lenso/auth-console/administration/server";
import { IdentityPage, AccessPage, AgentPage } from "@lenso/auth-console/administration/react";
import { Database } from "bun:sqlite";
assert.equal(typeof createAuthConsoleServer, "function");
assert.equal(typeof createConsoleAdministration, "function");
assert.equal(typeof createConsoleAdministrationStore, "function");
assert.ok(administrationActions.includes("users.list"));
assert.deepEqual([IdentityPage, AccessPage, AgentPage].map(page => typeof page), ["function", "function", "function"]);
const administrationDb = new Database(":memory:");
try {
  const store = createConsoleAdministrationStore({
    database: administrationDb, consoleId: "archive", tenantId: "archive",
    realmId: "archive", subjectActiveAtCommit: () => true,
  });
  assert.equal(store.initializeInstance("owner"), true);
  assert.equal(store.read().revision, "1");
} finally { administrationDb.close(); }
assert.ok(renderToString(React.createElement(ConsoleShell, {
  plugins: [], router: { pathname: "/", match: () => null, navigate() {} },
})).length > 0);
const db = new Database(":memory:");
try {
  initializeSqliteDashboardSchema(db);
  const repository = createSqliteDashboardRepository(db, { schemaVersion: 1, instances: [], placements: [] });
  const snapshot = await repository.transaction("archive-proof", async tx => tx.read());
  assert.equal(snapshot.revision, "0");
} finally { db.close(); }
const result = await Bun.build({ entrypoints: ["browser.ts"], target: "browser", write: false });
assert.ok(result.success, String(result.logs));
const output = await result.outputs[0].text();
for (const forbidden of ["bun:sqlite", "drizzle-orm", "createSessionAdministration", "createAuditedDashboardStore"]) {
  assert.ok(!output.includes(forbidden), "Browser archive leaked " + forbidden);
}
console.log("Optional Console archives: declarations, empty Shell, native SQLite and browser boundary passed");
`
  );
  execFileSync("bun", ["verify.mjs"], { cwd: consumer, stdio: "inherit" });
  // Source-level binding tests never render published JSX against production React.
  // This catches packages accidentally emitting jsxDEV, which is undefined there.
  fs.writeFileSync(
    path.join(consumer, "verify-production-auth.mjs"),
    `
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { authConsole } from "@lenso/auth-console/react";
import { IdentityPage, AccessPage, AgentPage } from "@lenso/auth-console/administration/react";
import { WorkspaceScope } from "@lenso/console-sdk/react";
import { ConsoleShell, ConsoleLayout, ConsoleActionHost } from "@lenso/console-react";
const binding = authConsole({
  id: "archive-proof",
  client: {
    capabilities: { info: true, sessionList: true, sessionDetail: true, sessionRevoke: false, subjects: true },
    async info() { return { realm: "test", source: "archive", policy: "read-only" }; },
    async listSessions() { return []; },
    async readSession() { return null; },
    async listSubjects() { return []; },
  },
  routes: { info: "/info", sessions: "/sessions", session: "/sessions/:id", subjects: "/subjects" },
});
for (const pathname of ["/info", "/sessions", "/sessions/test", "/subjects"]) {
  let matched = false;
  const html = renderToString(React.createElement(ConsoleShell, {
    plugins: [binding],
    router: {
      pathname,
      navigate() {},
      match(pattern, current) {
        if (pattern === current) {
          matched = true;
          return {};
        }
        if (pattern === "/sessions/:id" && current === "/sessions/test") {
          matched = true;
          return { id: "test" };
        }
        return null;
      },
    },
  }));
  assert.ok(matched, "Packed Auth route was not admitted: " + pathname);
  assert.ok(html.length > 0);
}
const client = {
  async invoke() { throw new Error("Unexpected archive render network request"); },
  async issueToken() { throw new Error("Unexpected archive render credential request"); },
  async rotateToken() { throw new Error("Unexpected archive render credential request"); },
};
const profile = {
  consoleId: "archive", tenantId: "archive", realmId: "archive",
  source: "archive", mcpUrl: "https://example.invalid/mcp", allowed: [],
  supported: { userDisable: false, sessions: false, sessionRevoke: false },
  authentication: "personal-token", observedLastCallAt: null,
};
for (const Page of [IdentityPage, AccessPage, AgentPage]) {
  const html = renderToString(React.createElement(WorkspaceScope, {
    value: {
      reads: {
        useRead({ key }) {
          assert.equal(key, "administration.info");
          return { data: profile, error: null, blocking: false, refreshing: false, async refetch() {} };
        },
        async invalidate() {},
      },
      activation: { key: "archive", isCurrent: () => true },
      mount: { id: "archive" },
      location: { hash: "", search: "", segments: [] },
      navigation: { go() {}, href() { return "/"; }, openWorkspace() {} },
    },
  }, React.createElement(ConsoleActionHost, {
    render: () => null,
    children: React.createElement(ConsoleLayout, null, React.createElement(Page, { client })),
  })));
  assert.ok(html.length > 0, "Packed administration page failed production rendering");
}
console.log("Packed Auth Console: legacy and administration pages rendered with production React");
`
  );
  execFileSync("node", ["verify-production-auth.mjs"], {
    cwd: consumer,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
  });
  for (const [command, args] of [
    ["bun", ["run", "test:conventions"]],
    ["bun", ["run", "service:boundary"]],
    ["bun", ["test", "tooling/distribution/sdk-preview.test.mjs"]],
    ["bun", ["run", "test:distribution"]],
  ]) {
    console.log(`+ ${command} ${args.join(" ")}`);
    execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
  }
} finally {
  fs.rmSync(temp, { force: true, recursive: true });
}
