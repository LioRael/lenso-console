import fs from "node:fs";
import path from "node:path";

export async function typecheck({
  out,
  authored,
  imports,
  checks,
  sdk,
  env = process.env,
}) {
  const directory = path.join(out, "typecheck");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: {
        typescript: "7.0.2",
        "@types/react": "19.2.18",
        "@types/bun": "1.4.0",
        "@lenso/contract-runtime": "0.3.0",
      },
    })
  );
  const install = Bun.spawnSync(["bun", "install", "--ignore-scripts"], {
    cwd: directory,
    env,
    stdout: "pipe",
    stderr: "inherit",
  });
  process.stderr.write(install.stdout);
  if (install.exitCode !== 0) {
    throw new Error("Console typecheck tools installation failed");
  }
  const bindings = path.join(directory, "entries.ts");
  fs.writeFileSync(
    bindings,
    `import type * as React from "react";\nimport type {PageProps,LayoutProps,ErrorProps} from "@lenso/console-sdk";\n${imports.join("\n")}\n${checks.join("\n")}`
  );
  const modules = path.join(directory, "node_modules");
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
  const result = Bun.spawnSync(
    ["bun", path.join(modules, "typescript/bin/tsc"), "--project", config],
    { stdout: "pipe", stderr: "inherit" }
  );
  process.stderr.write(result.stdout);
  if (result.exitCode !== 0) {
    throw new Error("Console source typecheck failed");
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
