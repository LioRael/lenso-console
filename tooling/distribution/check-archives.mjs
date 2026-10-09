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
