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
    "@lenso/audit": "0.3.1",
    "@lenso/auth": "0.3.1",
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
    "@types/bun": "1.4.2",
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
import type { AuthConsoleClient } from "@lenso/auth-console/client";
import type { DashboardStore } from "@lenso/console-dashboard";
export const publicModules = { shell, dashboard, plugins, auth };
export type Clients = { auth: AuthConsoleClient; dashboard: DashboardStore };
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
import { Database } from "bun:sqlite";
assert.equal(typeof createAuthConsoleServer, "function");
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
