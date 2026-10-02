import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root)));
const nodeVersion = readFileSync(
  new URL(".node-version", root),
  "utf-8"
).trim();
assert.equal(process.versions.node, nodeVersion, `Use Node ${nodeVersion}`);
const version = (command, args = ["--version"]) =>
  execFileSync(command, args, { encoding: "utf-8" }).trim();
assert.equal(
  version("pnpm"),
  manifest.packageManager.split("@")[1].split("+")[0]
);
const [, rust] = readFileSync(
  new URL("rust-toolchain.toml", root),
  "utf-8"
).match(/channel = "([^"]+)"/u);
assert.ok(version("rustc").startsWith(`rustc ${rust} `), `Use Rust ${rust}`);
assert.ok(version("cargo").startsWith(`cargo ${rust} `), `Use Cargo ${rust}`);
console.log(
  `Console check: sha=${version("git", ["rev-parse", "HEAD"])} dirty=${Boolean(version("git", ["status", "--porcelain"]))} node=${nodeVersion} pnpm=${version("pnpm")} rust=${rust} os=${process.platform}-${process.arch}`
);
