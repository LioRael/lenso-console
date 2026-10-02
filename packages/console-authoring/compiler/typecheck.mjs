import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { generateClient } from "./client-generation.mjs";

export async function typecheck({
  root,
  out,
  authored,
  imports,
  checks,
  sdk,
  env = process.env,
}) {
  const directory = path.join(out, "typecheck");
  fs.mkdirSync(directory, { recursive: true });
  const require = createRequire(import.meta.url);
  let modules;
  try {
    const local = path.resolve(import.meta.dir, "../node_modules");
    modules = fs.existsSync(path.join(local, "typescript/package.json"))
      ? local
      : path.dirname(path.dirname(require.resolve("typescript/package.json")));
  } catch {
    // Precompiled kits bootstrap their one authoring dependency closure here.
    fs.copyFileSync(
      path.resolve(import.meta.dir, "../package.json"),
      path.join(directory, "package.json")
    );
    const install = Bun.spawnSync(
      [process.execPath, "install", "--ignore-scripts"],
      {
        cwd: directory,
        env,
        stdout: "pipe",
        stderr: "inherit",
      }
    );
    process.stderr.write(install.stdout);
    if (install.exitCode !== 0) {
      throw new Error("Console authoring tools installation failed");
    }
    modules = path.join(directory, "node_modules");
  }
  const bindings = path.join(directory, "entries.ts");
  fs.writeFileSync(
    bindings,
    `import type * as React from "react";\nimport type {PageProps,LayoutProps,ErrorProps} from "@lenso/console-sdk";\n${imports.join("\n")}\n${checks.join("\n")}`
  );
  const config = path.join(directory, "tsconfig.json");
  fs.writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2023",
        module: "Preserve",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        allowImportingTsExtensions: true,
        skipLibCheck: true,
        types: ["react", "bun"],
        typeRoots: [path.join(modules, "@types")],
        paths: {
          react: [path.join(modules, "@types/react/index.d.ts")],
          "react/*": [path.join(modules, "@types/react/*")],
          "@lenso/console-sdk": [sdk],
          "@lenso/console-sdk/client": [
            path.join(path.dirname(sdk), "client.ts"),
          ],
          "@lenso/console-sdk/services": [path.join(out, "client.ts")],
          "@lenso/console-sdk/server": [
            path.join(path.dirname(sdk), "server.ts"),
          ],
          "@lenso/contract-runtime": [
            path.join(modules, "@lenso/contract-runtime"),
          ],
        },
      },
      files: [...authored, bindings, path.join(import.meta.dir, "router.ts")],
    })
  );
  generateClient({
    root,
    out,
    config: JSON.parse(fs.readFileSync(config, "utf-8")),
    checker: path.join(modules, "typescript/bin/tsc"),
  });
  const result = Bun.spawnSync(
    [
      process.execPath,
      path.join(modules, "typescript/bin/tsc"),
      "--project",
      config,
    ],
    { stdout: "pipe", stderr: "inherit" }
  );
  process.stderr.write(result.stdout);
  if (result.exitCode !== 0) {
    throw new Error("Console source typecheck failed");
  }
  const editor = JSON.parse(fs.readFileSync(config, "utf-8"));
  editor.files = authored;
  fs.writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify(editor, null, 2)
  );
  // Retain bootstrapped tools if this is a kit; installed SDK consumers need no copy.
  if (modules !== path.join(directory, "node_modules")) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
