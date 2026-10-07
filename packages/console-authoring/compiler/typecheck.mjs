import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { generateClient } from "./client-generation.mjs";

export async function typecheck({ root, out, authored, imports, checks, sdk }) {
  const directory = path.join(out, "typecheck");
  fs.mkdirSync(directory, { recursive: true });
  const require = createRequire(import.meta.url);
  let checker;
  let reactTypes;
  let bunTypes;
  try {
    // Resolve each declared dependency through this package. Their physical
    // parents differ in ordinary Bun/pnpm installations; no shared root exists.
    const manifest = require.resolve("typescript/package.json");
    const typescript = JSON.parse(fs.readFileSync(manifest, "utf-8"));
    checker = path.resolve(path.dirname(manifest), typescript.bin.tsc);
    fs.accessSync(checker, fs.constants.R_OK);
    reactTypes = path.dirname(require.resolve("@types/react/package.json"));
    bunTypes = path.dirname(require.resolve("@types/bun/package.json"));
  } catch (error) {
    throw new Error(
      "Console SDK dependencies are missing. Install the application's locked dependencies before building, or reinstall the complete Console development kit.",
      { cause: error }
    );
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
        typeRoots: [path.dirname(reactTypes), path.dirname(bunTypes)],
        paths: {
          react: [path.join(reactTypes, "index.d.ts")],
          "react/*": [path.join(reactTypes, "*")],
          "@lenso/console-sdk": [sdk],
          "@lenso/console-sdk/locale": [
            path.join(path.dirname(sdk), "locale.ts"),
          ],
          "@lenso/console-sdk/i18n": [path.join(path.dirname(sdk), "i18n.ts")],
          "@lenso/console-sdk/client": [
            path.join(path.dirname(sdk), "client.ts"),
          ],
          "@lenso/console-sdk/services": [path.join(out, "client.ts")],
          "@lenso/console-sdk/server": [
            path.join(path.dirname(sdk), "server.ts"),
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
    checker,
  });
  const result = Bun.spawnSync(
    [process.execPath, checker, "--project", config],
    { stdout: "pipe", stderr: "inherit" }
  );
  process.stderr.write(result.stdout);
  if (result.exitCode !== 0) {
    throw new Error("Console source typecheck failed");
  }
  const editor = JSON.parse(fs.readFileSync(config, "utf-8"));
  editor.files = authored;
  fs.writeFileSync(
    path.join(out, "tsconfig.authoring.json"),
    JSON.stringify(editor, null, 2)
  );
  // The editor config references the installed closure; no tools enter the artifact.
  fs.rmSync(directory, { recursive: true, force: true });
}
