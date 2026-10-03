import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

// Prevent Git consumers from requiring generated assets inside Cargo's cache.
// Existing distribution fixtures stage assets but never execute build.rs or
// compile its generated include_bytes! expressions.
test("embedded Shell consumes external assets and rejects invalid inputs", async () => {
  const temp = await mkdtemp(join(tmpdir(), "console-embedded-shell-"));
  try {
    const plugin = join(temp, "git-checkout", "plugins", "console");
    const assets = join(temp, "built-shell");
    const output = join(temp, "output");
    await Promise.all([
      mkdir(plugin, { recursive: true }),
      mkdir(assets),
      mkdir(output),
    ]);
    await writeFile(join(assets, "index.html"), "<main>external Shell</main>");
    const buildScript = join(temp, "console-build");
    const compile = spawnSync(
      "rustc",
      [
        resolve("plugins/console/build.rs"),
        "--edition=2024",
        "-o",
        buildScript,
      ],
      { encoding: "utf-8" }
    );
    assert.equal(compile.status, 0, compile.stderr);
    const env = { ...process.env, OUT_DIR: output };
    delete env.CARGO_FEATURE_EMBEDDED_SHELL;
    delete env.LENSO_CONSOLE_SHELL_ROOT;
    const run = (overrides) =>
      spawnSync(buildScript, [], {
        cwd: plugin,
        encoding: "utf-8",
        env: { ...env, ...overrides },
      });
    const embedded = run({
      CARGO_FEATURE_EMBEDDED_SHELL: "1",
      LENSO_CONSOLE_SHELL_ROOT: assets,
    });
    assert.equal(embedded.status, 0, embedded.stderr);
    assert.match(
      embedded.stdout,
      /cargo:rerun-if-env-changed=LENSO_CONSOLE_SHELL_ROOT/u
    );
    assert.ok(embedded.stdout.includes(`cargo:rerun-if-changed=${assets}`));
    const probe = join(temp, "probe.rs");
    const probeBinary = join(temp, "probe");
    const compileAndRunProbe = async (body) => {
      await writeFile(
        probe,
        `include!(${JSON.stringify(join(output, "shell.rs"))});
fn main() { ${body} }`
      );
      const compiled = spawnSync(
        "rustc",
        [probe, "--edition=2024", "-o", probeBinary],
        { encoding: "utf-8" }
      );
      assert.equal(compiled.status, 0, compiled.stderr);
      const result = spawnSync(probeBinary, [], { encoding: "utf-8" });
      assert.equal(result.status, 0, result.stderr);
      return result;
    };
    const result = await compileAndRunProbe(
      'assert_eq!(EMBEDDED_SHELL.len(), 1); assert_eq!(EMBEDDED_SHELL[0].0, "index.html"); print!("{}", std::str::from_utf8(EMBEDDED_SHELL[0].1).unwrap());'
    );
    assert.equal(result.stdout, "<main>external Shell</main>");

    const disabled = run({ LENSO_CONSOLE_SHELL_ROOT: "unused-relative-path" });
    assert.equal(disabled.status, 0, disabled.stderr);
    await compileAndRunProbe("assert!(EMBEDDED_SHELL.is_empty());");
    const relative = run({
      CARGO_FEATURE_EMBEDDED_SHELL: "1",
      LENSO_CONSOLE_SHELL_ROOT: "relative-assets",
    });
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /must be an absolute path/u);
    const missing = run({
      CARGO_FEATURE_EMBEDDED_SHELL: "1",
      LENSO_CONSOLE_SHELL_ROOT: output,
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /build Console Shell/u);
    await symlink(join(assets, "index.html"), join(assets, "linked.html"));
    const linked = run({
      CARGO_FEATURE_EMBEDDED_SHELL: "1",
      LENSO_CONSOLE_SHELL_ROOT: assets,
    });
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /Shell assets must be regular files/u);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});
