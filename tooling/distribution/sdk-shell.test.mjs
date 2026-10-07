import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { preparePreview } from "./prepare-sdk-preview.mjs";
import { prepareShell, validateShell } from "./prepare-sdk-shell.mjs";

// A tarball that loses referenced assets makes clean App builds unusable even
// though the compiler remains present. Existing compiler tests do not serve UI.
test(
  "SDK archive resolves compiler and complete production and preview Shells",
  {
    skip: !fs.existsSync(
      path.resolve("packages/console-authoring/shell/index.html")
    ),
  },
  () => {
    const temp = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "console-sdk-shell-"))
    );
    try {
      const packageRoot = path.resolve("packages/console-authoring");
      validateShell(path.join(packageRoot, "shell"));
      preparePreview(path.resolve("."), packageRoot);
      const [pack] = Object.values(
        JSON.parse(
          execFileSync(
            "npm",
            [
              "pack",
              packageRoot,
              "--ignore-scripts",
              "--json",
              "--pack-destination",
              temp,
              "--cache",
              path.join(temp, "npm-cache"),
            ],
            { encoding: "utf-8" }
          )
        )
      );
      const installed = path.join(temp, "node_modules/@lenso/console-sdk");
      fs.mkdirSync(installed, { recursive: true });
      execFileSync("tar", [
        "-xzf",
        path.join(temp, pack.filename),
        "--strip-components=1",
        "-C",
        installed,
      ]);
      const resolved = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "-e",
            `console.log(JSON.stringify([
      require.resolve('@lenso/console-sdk/compiler'),require.resolve('@lenso/console-sdk/shell')]))`,
          ],
          { cwd: temp, encoding: "utf-8" }
        )
      );
      assert.equal(resolved[0], path.join(installed, "compiler/compiler.mjs"));
      assert.equal(resolved[1], path.join(installed, "shell/index.html"));
      validateShell(path.dirname(resolved[1]));
      for (const directory of ["shell", "dev/shell", "dev/shared"]) {
        const sourceRoot = path.join(packageRoot, directory);
        for (const name of fs.readdirSync(sourceRoot, { recursive: true })) {
          const original = path.join(sourceRoot, name);
          if (!fs.statSync(original).isFile()) {
            continue;
          }
          assert.deepEqual(
            fs.readFileSync(path.join(installed, directory, name)),
            fs.readFileSync(original),
            `Archived Shell file differs: ${directory}/${name}`
          );
        }
      }
      assert.ok(
        pack.files.some((file) => file.path.startsWith("shell/assets/"))
      );
    } finally {
      fs.rmSync(temp, { force: true, recursive: true });
    }
  }
);

test("Shell preparation rejects missing references and symlink assets", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "console-shell-invalid-"));
  try {
    const source = path.join(temp, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, "index.html"),
      '<script src="/missing.js"></script>'
    );
    assert.throws(
      () => prepareShell(source, path.join(temp, "out")),
      /ENOENT/u
    );
    fs.writeFileSync(path.join(source, "missing.js"), "export {};");
    fs.symlinkSync(
      path.join(source, "missing.js"),
      path.join(source, "linked.js")
    );
    assert.throws(
      () => prepareShell(source, path.join(temp, "out")),
      /regular files/u
    );
  } finally {
    fs.rmSync(temp, { force: true, recursive: true });
  }
});
