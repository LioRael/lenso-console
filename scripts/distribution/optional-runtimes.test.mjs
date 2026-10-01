import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolveRuntime as resolveAgentRuntime } from "../../packages/agent/bin/lenso-agent.mjs";
import {
  launch,
  parseArgs,
  resolveRuntime,
} from "../../packages/console/bin/lenso-console.mjs";
import { packageConsole } from "./package-console.mjs";

// Prevent a supposedly optional assistant package from copying core Console
// files or dropping its real Agent installation dependency.
test("assistant assets stage independently with an exact native Agent dependency", async () => {
  const temp = await mkdtemp(join(tmpdir(), "assistant-assets-package-"));
  try {
    const assets = join(temp, "assets");
    const output = join(temp, "assistant");
    await mkdir(assets);
    await writeFile(join(assets, "assistant.mjs"), "export const apiMajor=1;");
    await writeFile(join(assets, "assistant.css"), ":root{color:inherit}");
    await writeFile(
      join(assets, "assets.json"),
      JSON.stringify(["assistant.mjs", "assistant.css"])
    );
    const staged = spawnSync(
      process.execPath,
      ["scripts/distribution/package-assistant.mjs", assets, output],
      { encoding: "utf-8" }
    );
    assert.equal(staged.status, 0, staged.stderr);
    const manifest = JSON.parse(await readFile(join(output, "package.json")));
    const { version } = JSON.parse(await readFile("package.json"));
    assert.equal(manifest.name, "@lenso/console-assistant");
    assert.deepEqual(manifest.dependencies, { "@lenso/agent-native": version });
    const packageFiles = await readdir(output);
    assert.deepEqual(packageFiles.toSorted(), [
      "LICENSE",
      "package.json",
      "ui",
    ]);
    const uiFiles = await readdir(join(output, "ui"));
    assert.deepEqual(uiFiles.toSorted(), [
      "assets.json",
      "assistant.css",
      "assistant.mjs",
    ]);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});

// Prevent accidental Agent installation and Console requirements in independent
// runtimes; existing launcher tests only exercised the combined distribution.
test("Console stages and starts with no Agent installation", async () => {
  const temp = await mkdtemp(join(tmpdir(), "console-independent-"));
  try {
    const web = join(temp, "web");
    await mkdir(web);
    await writeFile(join(web, "index.html"), "<main>Console fixture</main>");
    const binary = join(temp, "host");
    await writeFile(
      binary,
      `#!${process.execPath}\nif (process.env.CONSOLE_WEB_ROOT !== ${JSON.stringify(join(temp, "out", `console-${process.platform}-${process.arch}`, "web"))}) process.exit(3);\nprocess.exit(17);\n`
    );
    await chmod(binary, 0o755);
    const staged = await packageConsole(
      `${process.platform}-${process.arch}`,
      binary,
      web,
      join(temp, "out")
    );
    const manifest = JSON.parse(
      await readFile(join(staged.launcher, "package.json"))
    );
    assert.deepEqual(Object.keys(manifest.optionalDependencies), [
      "@lenso/console-darwin-arm64",
      "@lenso/console-linux-x64",
    ]);
    assert.deepEqual(await readdir(join(staged.platform, "bin")), [
      "lenso-console",
    ]);
    assert.equal(
      JSON.parse(await readFile(join(staged.platform, "package.json")))
        .dependencies,
      undefined
    );
    // Source version and root version are synchronized by release staging.
    const sourceVersion = JSON.parse(
      await readFile("packages/console/package.json")
    ).version;
    const runtimeManifest = join(staged.platform, "package.json");
    const metadata = JSON.parse(await readFile(runtimeManifest));
    await writeFile(
      runtimeManifest,
      JSON.stringify({ ...metadata, version: sourceVersion })
    );
    assert.equal(
      resolveRuntime(process.platform, process.arch, () => runtimeManifest),
      staged.platform
    );
    assert.equal(
      await launch({ open: false, port: 3456 }, staged.platform),
      17
    );
    await assert.rejects(
      packageConsole(
        `${process.platform}-${process.arch}`,
        binary,
        web,
        join(temp, "out")
      ),
      /EEXIST/u
    );
    assert.deepEqual(parseArgs(["--port", "3456", "--no-open"]), {
      open: false,
      port: 3456,
    });
    assert.throws(() => parseArgs(["web"]), /Unknown option/u);
    await writeFile(
      runtimeManifest,
      JSON.stringify({ ...metadata, version: "0.0.0" })
    );
    assert.throws(
      () =>
        resolveRuntime(process.platform, process.arch, () => runtimeManifest),
      /version mismatch/u
    );
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});

test("native Agent stages only one verified executable and launches without Console files", async () => {
  const temp = await mkdtemp(join(tmpdir(), "agent-native-package-"));
  try {
    const scriptDir = join(temp, "scripts/distribution");
    await mkdir(scriptDir, { recursive: true });
    await mkdir(join(temp, "payload"));
    const executable = join(temp, "payload/lenso-agent");
    await writeFile(executable, `#!${process.execPath}\nprocess.exit(17);\n`);
    await chmod(executable, 0o755);
    const archive = join(temp, "agent.tar.gz");
    assert.equal(
      spawnSync("tar", [
        "-czf",
        archive,
        "-C",
        join(temp, "payload"),
        "lenso-agent",
      ]).status,
      0
    );
    const bytes = await readFile(archive);
    const target = `${process.platform}-${process.arch}`;
    const releaseTarget =
      process.platform === "darwin" ? "darwin-aarch64" : "linux-x86_64";
    const asset = `lenso-agent-v0.0.1-${releaseTarget}.tar.gz`;
    await writeFile(
      join(scriptDir, "agent-release.json"),
      JSON.stringify({
        assets: { [asset]: createHash("sha256").update(bytes).digest("hex") },
        repository: "fixture/agent",
        version: "0.0.1",
      })
    );
    await cp(
      "scripts/distribution/package-agent.mjs",
      join(scriptDir, "package-agent.mjs")
    );
    await cp("packages/agent", join(temp, "packages/agent"), {
      recursive: true,
    });
    await writeFile(
      join(temp, "package.json"),
      JSON.stringify({ version: "1.20.0" })
    );
    await writeFile(join(temp, "LICENSE"), "Fixture license");
    const script = `import {readFileSync} from 'node:fs';globalThis.fetch=async(url)=>{if(!String(url).endsWith(${JSON.stringify(asset)}))throw Error('Unexpected download: '+url);return new Response(readFileSync(${JSON.stringify(archive)}));};process.argv=['node',${JSON.stringify(join(scriptDir, "package-agent.mjs"))},${JSON.stringify(target)},'unused-console-binary',${JSON.stringify(join(temp, "out"))},'--native-only'];await import(${JSON.stringify(join(scriptDir, "package-agent.mjs"))});`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf-8" }
    );
    assert.equal(result.status, 0, result.stderr);
    const runtime = join(temp, "out", `agent-native-${target}`);
    assert.deepEqual(await readdir(join(runtime, "bin")), ["lenso-agent"]);
    const runtimeFiles = await readdir(runtime);
    assert.ok(!runtimeFiles.includes("web"));
    const launcher = join(temp, "out/agent-native");
    const manifest = JSON.parse(await readFile(join(launcher, "package.json")));
    assert.equal(manifest.nativeOnly, true);
    assert.equal(manifest.name, "@lenso/agent-native");
    await mkdir(join(launcher, "node_modules/@lenso"), { recursive: true });
    await cp(
      runtime,
      join(launcher, "node_modules/@lenso", `agent-native-${target}`),
      { recursive: true }
    );
    const native = spawnSync(
      process.execPath,
      [join(launcher, "bin/lenso-agent.mjs"), "doctor"],
      { encoding: "utf-8" }
    );
    assert.equal(native.status, 17, native.stderr);
    const web = spawnSync(
      process.execPath,
      [join(launcher, "bin/lenso-agent.mjs"), "web"],
      { encoding: "utf-8" }
    );
    assert.equal(web.status, 1);
    assert.match(web.stderr, /does not include Console/u);
    // The combined launcher's native dispatch also tolerates a native-only closure.
    const sourceVersion = JSON.parse(
      await readFile("packages/agent/package.json")
    ).version;
    const metadataPath = join(runtime, "package.json");
    await writeFile(metadataPath, JSON.stringify({ version: sourceVersion }));
    assert.equal(
      resolveAgentRuntime(
        process.platform,
        process.arch,
        "lenso-agent",
        () => metadataPath
      ),
      runtime
    );
    assert.throws(
      () =>
        resolveAgentRuntime(
          process.platform,
          process.arch,
          undefined,
          () => metadataPath
        ),
      /ENOENT/u
    );
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});
