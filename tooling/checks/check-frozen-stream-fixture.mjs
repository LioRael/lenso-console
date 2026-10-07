import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const root = ".github/fixtures/console-kit-stream";
const digest = (path) =>
  createHash("sha256").update(fs.readFileSync(path)).digest("hex");

// These manifests belong to the already qualified fa6 proof, not a rebuilt
// candidate kit. Pin both so changing bytes and their hashes cannot silently
// relabel that proof. A new fixture needs its own qualification and identity.
for (const [path, expected] of [
  [
    "freeze.json",
    "4a53f230d107084aa67dfa4d22aa4a6d0fda718a428ad05f1cfc70f64b730b9d",
  ],
  [
    "fixture-files.sha256",
    "477e6b3a72fbecc8598fa480d2f4e7f5c34641023d3a09cd279573e2a3334e3a",
  ],
]) {
  assert.equal(digest(`${root}/${path}`), expected, `Frozen ${path} changed`);
}

const freeze = JSON.parse(fs.readFileSync(`${root}/freeze.json`, "utf-8"));
for (const [path, expected] of Object.entries(freeze.fixture_file_sha256)) {
  assert.equal(digest(`${root}/${path}`), expected, `Frozen ${path} changed`);
}
console.log("Console Stream snapshot matches the frozen fa6 proof (7 files)");
