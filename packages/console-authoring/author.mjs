#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

const [command, ...args] = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
if (command === "init" && args.length === 1 && !args[0].startsWith("-")) {
  const root = path.resolve(args[0]);
  if (fs.existsSync(root)) {
    throw new Error(`Directory already exists: ${root}`);
  }
  fs.cpSync(path.join(import.meta.dir, "template"), root, { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), ".lenso/\nnode_modules/\n");
  console.log(
    `Created ${root}\nRun: lenso-console-author check --entry ${JSON.stringify(root)}`
  );
} else if (["check", "build"].includes(command) && value("--entry")) {
  const flags = new Set(["--entry", "--out", "--plugin-id", "--version"]);
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    if (
      !flags.has(args[index]) ||
      seen.has(args[index]) ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    ) {
      throw new Error(`Invalid or repeated authoring option: ${args[index]}`);
    }
    seen.add(args[index]);
  }
  const entry = path.resolve(value("--entry"));
  const output = path.resolve(
    value("--out") || path.join(entry, ".lenso", "console")
  );
  if (output === entry || entry.startsWith(output + path.sep)) {
    throw new Error("Output must not contain authored source");
  }
  fs.mkdirSync(output, { recursive: true });
  const result = Bun.spawnSync(
    [process.execPath, path.join(import.meta.dir, "compiler/compiler.mjs")],
    {
      stdin: Buffer.from(
        JSON.stringify({
          schema: "lenso.convention-compile.v1",
          entry,
          output,
          owner_project: entry,
          plugin_id: value("--plugin-id") || "example.console",
          release_version: value("--version") || "0.1.0",
        })
      ),
      stdout: "pipe",
      stderr: "inherit",
    }
  );
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
  console.log(
    `Console ${command} passed: ${output}\nGenerated client: ${path.join(output, "client.ts")}\nThe generated Plugin must still be admitted by a compatible Host; this command grants no authority.`
  );
} else {
  console.error(
    "Usage: lenso-console-author init <console-directory> | check/build --entry <console-directory> [--out <directory>] [--plugin-id <id>] [--version <semver>]"
  );
  process.exit(1);
}
