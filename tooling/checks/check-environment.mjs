import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root)));
const version = (command, args = ["--version"]) =>
  execFileSync(command, args, { encoding: "utf-8" }).trim();
const bunVersion = readFileSync(new URL(".bun-version", root), "utf-8").trim();
assert.match(manifest.packageManager, /^bun@/u);
assert.ok(manifest.engines?.bun, "package.json must declare engines.bun");
assert.equal(version("bun"), bunVersion, `Use Bun ${bunVersion}`);
console.log(
  `Console check: sha=${version("git", ["rev-parse", "HEAD"])} dirty=${Boolean(version("git", ["status", "--porcelain"]))} bun=${version("bun")} os=${process.platform}-${process.arch} source=${process.cwd()}`
);
