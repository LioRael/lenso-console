import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [file] = process.argv.slice(2);
assert.ok(file, "Supply the compiled console-wasm consumer .wasm path");
const module = new WebAssembly.Module(await readFile(file));
const imports = {};
for (const entry of WebAssembly.Module.imports(module)) {
  assert.equal(entry.kind, "function", "No host memory or filesystem fixture");
  imports[entry.module] ??= {};
  imports[entry.module][entry.name] = () => {
    throw new Error(`Unexpected host call: ${entry.module}.${entry.name}`);
  };
}
const { exports } = new WebAssembly.Instance(module, imports);
console.log(
  `Wasm std::path('/') absolute: ${exports.console_std_root_is_absolute()}`
);
for (const [testCase, name] of [
  [0, "relative configuration resolved from portable root"],
  [1, "explicit absolute portable paths preserved"],
]) {
  const result = exports.console_wasm_activate(testCase);
  const failure = [];
  for (let i = 0; exports.console_wasm_failure_byte(i); i += 1) {
    failure.push(exports.console_wasm_failure_byte(i));
  }
  assert.equal(
    result,
    0,
    `${name}: ${new TextDecoder().decode(Uint8Array.from(failure))}`
  );
  console.log(
    `PASS real Wasm Kernel/Console activate + HTTP health: ${name}; all three relative runtime paths rejected`
  );
}
