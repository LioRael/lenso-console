import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";

import * as sdk from "../../src/index";

const Page = () => null;

// Hook removal alone cannot detect a transitive runtime import added to a pure
// helper. Build the full root graph with no tree-shaking of its public exports.
test("SDK root builds for browsers without React, server, or compiler modules", async () => {
  const forbidden: string[] = [];
  const result = await Bun.build({
    entrypoints: [new URL("../../src/index.ts", import.meta.url).pathname],
    target: "browser",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "root-boundary",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(react(?:\/.*)?|@tanstack\/react-.*|node:.*|@lenso\/(?:core|engine|manage))$/,
            },
            (args) => {
              forbidden.push(args.path);
              return { path: args.path, external: true };
            }
          );
          build.onLoad(
            { filter: /[/\\](?:server\.ts|compiler[/\\].*)$/ },
            (args) => {
              forbidden.push(args.path);
            }
          );
        },
      },
    ],
  });
  expect(result.success).toBe(true);
  expect(forbidden).toEqual([]);
  expect("useWorkspace" in sdk).toBe(false);
  expect("useWorkspaceRead" in sdk).toBe(false);
  expect(sdk.definePage(Page)).toBe(Page);
});

// Bun's runtime build erases types. This separate proof detects declaration
// edges that would force client-only consumers to install server frameworks.
test("typed client contracts do not resolve server framework packages", () => {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve("typescript/package.json");
  const checker = path.resolve(
    path.dirname(manifest),
    require(manifest).bin.tsc
  );
  const result = Bun.spawnSync(
    [
      process.execPath,
      checker,
      "--ignoreConfig",
      "--strict",
      "--skipLibCheck",
      "--noEmit",
      "--target",
      "ES2023",
      "--module",
      "Preserve",
      "--moduleResolution",
      "bundler",
      "--types",
      "bun",
      "--traceResolution",
      path.join(import.meta.dir, "client-boundary.types.ts"),
    ],
    { stdout: "pipe", stderr: "pipe" }
  );
  const trace = result.stdout.toString();
  expect(result.exitCode, `${trace}\n${result.stderr}`).toBe(0);
  for (const name of [
    "@lenso/core",
    "@lenso/engine",
    "@lenso/manage",
    "react",
  ]) {
    expect(trace).not.toContain(`Resolving module '${name}`);
  }
});
