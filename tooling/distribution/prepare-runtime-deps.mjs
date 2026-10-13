import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import bootstrapPackages from "./runtime-deps.bootstrap.json";
import pins from "./runtime-deps.json";

const owner = "lenso-console-runtime-deps-v1\n";
const outputs = ["runtime", "sdk", "adapter", "provenance.json"];
const maxBytes = 20 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const stat = async (path) => {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
};

// In-process injection supports offline failure fixtures, never CLI pin overrides.
export const downloadSnapshot = async (pin, fetcher = fetch) => {
  if (
    !["lenso", "lenso-runtime"].includes(pin.repo) ||
    !/^[a-f0-9]{40}$/u.test(pin.commit) ||
    !/^[a-f0-9]{64}$/u.test(pin.sha256)
  ) {
    throw new Error("Invalid Runtime dependency snapshot pin");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let reader;
  try {
    const response = await fetcher(
      `https://codeload.github.com/LioRael/${pin.repo}/tar.gz/${pin.commit}`,
      { redirect: "error", signal: controller.signal }
    );
    if (!response.ok || !response.body) {
      throw new Error("Snapshot download failed");
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      throw new Error("Snapshot exceeds byte limit");
    }
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        throw new Error("Snapshot exceeds byte limit");
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, size);
    if (hash(bytes) !== pin.sha256) {
      throw new Error("Snapshot checksum mismatch");
    }
    return bytes;
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => {
      /* empty */
    });
    clearTimeout(timeout);
  }
};

const extract = async (bytes, pin, destination) => {
  await mkdir(destination);
  const prefix = `${pin.repo}-${pin.commit}/`;
  const archive = new Bun.Archive(Bun.gunzipSync(bytes));
  for (const [name, file] of await archive.files()) {
    const relative = name.slice(prefix.length);
    if (
      !name.startsWith(prefix) ||
      !relative ||
      relative.includes("\\") ||
      relative.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Unexpected snapshot archive path");
    }
    const path = join(destination, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await file.bytes());
  }
};

const execute = async (args, cwd) => {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    // Public dependency preparation does not need participant credentials/config.
    env: {
      BUN_INSTALL_CACHE_DIR: join(cwd, ".bun-cache"),
      HOME: cwd,
      PATH: process.env.PATH,
    },
    stderr: "inherit",
    stdin: "ignore",
    stdout: "inherit",
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 300000);
  try {
    if ((await child.exited) !== 0) {
      throw new Error(
        `Runtime dependency command failed: bun ${args.join(" ")}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
};

const hashes = async (root, prefix = "") => {
  const result = {};
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(result, await hashes(root, relative));
    } else if (entry.isFile()) {
      result[relative] = hash(await readFile(join(root, relative)));
    } else {
      throw new Error(
        "Prepared artifacts must contain only regular files and directories"
      );
    }
  }
  return result;
};

const packageArtifact = async (
  source,
  destination,
  name,
  entries,
  dependencies
) => {
  const manifest = JSON.parse(
    await readFile(join(source, "package.json"), "utf-8")
  );
  if (
    manifest.name !== name ||
    manifest.version !== "0.1.0" ||
    manifest.private
  ) {
    throw new Error(`Unexpected public package: ${name}`);
  }
  delete manifest.scripts;
  delete manifest.devDependencies;
  if (dependencies) {
    manifest.dependencies = dependencies;
  }
  for (const value of Object.values(manifest.dependencies ?? {})) {
    if (/^(workspace:|file:|link:)/u.test(value)) {
      throw new Error("Non-public artifact dependency");
    }
  }
  await mkdir(destination);
  await writeFile(
    join(destination, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await cp(join(source, "dist"), join(destination, "dist"), {
    dereference: false,
    recursive: true,
  });
  const files = await hashes(destination);
  for (const entry of entries) {
    for (const extension of ["js", "d.ts"]) {
      const file = `dist/${entry}.${extension}`;
      if (!files[file]) {
        throw new Error(`${name} is missing ${file}`);
      }
    }
  }
  return files;
};

const ownedOutput = async (root) => {
  const output = join(root, ".runtime-deps");
  const existing = await stat(output);
  if (existing) {
    const marker = await stat(join(output, ".owner"));
    if (
      !existing.isDirectory() ||
      existing.isSymbolicLink() ||
      !marker?.isFile() ||
      marker.isSymbolicLink() ||
      (await readFile(join(output, ".owner"), "utf-8")) !== owner
    ) {
      throw new Error("Refusing to replace unowned .runtime-deps");
    }
  } else {
    await mkdir(output);
    await writeFile(join(output, ".owner"), owner, { flag: "wx" });
  }
  return output;
};

const copyLocalRuntime = async (directory, destination) => {
  const root = resolve(directory);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("Runtime root must be a regular directory");
  }
  const { stdout } = await promisify(execFile)("git", ["ls-files", "-z"], {
    cwd: root,
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });
  const files = {};
  let size = 0;
  const paths = stdout
    .split("\0")
    .filter(Boolean)
    .filter(
      (path) =>
        /^(package\.json|bun\.lock|tsconfig\.json|Cargo\.(toml|lock)|tools\/generate\.ts)$/u.test(
          path
        ) ||
        /^(sdk\/typescript\/[^/]+\.(ts|json)|crates\/[^/]+\/(Cargo\.toml|(src|tests)\/[^/]+\.rs)|examples\/batch\/(Cargo\.toml|src\/(bin\/)?[^/]+\.rs)|examples\/contracts\/[^/]+\.json|examples\/generated\/[^/]+\.(rs|ts))$/u.test(
          path
        )
    );
  // Shared candidate schema cases are an explicit source input, even before Git staging.
  const schemaCases = "crates/sdk/tests/schema-cases.json";
  if (await stat(join(root, schemaCases))) {
    paths.push(schemaCases);
  }
  if (paths.length > 4096) {
    throw new Error("Local Runtime source exceeds file limit");
  }
  for (const path of paths.toSorted()) {
    const parts = path.split("/");
    if (
      parts.some((part) => !part || part === "." || part === "..") ||
      path.includes("\\")
    ) {
      throw new Error("Unexpected local Runtime path");
    }
    for (let i = 1; i <= parts.length; i += 1) {
      const entry = await lstat(join(root, ...parts.slice(0, i)));
      if (
        entry.isSymbolicLink() ||
        (i === parts.length ? !entry.isFile() : !entry.isDirectory())
      ) {
        throw new Error(
          "Local Runtime source must contain only regular files and directories"
        );
      }
    }
    const bytes = await Bun.file(join(root, path))
      .slice(0, maxBytes + 1)
      .bytes();
    size += bytes.length;
    if (size > maxBytes) {
      throw new Error("Local Runtime source exceeds byte limit");
    }
    files[path] = hash(bytes);
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), bytes);
  }
  const manifest = JSON.parse(
    await readFile(join(destination, "package.json"), "utf-8")
  );
  if (
    manifest.name !== "lenso-runtime-workspace" ||
    manifest.private !== true
  ) {
    throw new Error("Local source must be lenso-runtime-workspace");
  }
  return {
    files,
    kind: "local",
    root,
    sha256: hash(Buffer.from(JSON.stringify(files))),
  };
};

const stageSources = async (temporary, snapshots, fetcher, runtimeRoot) => {
  // Authenticate remote archives before extraction or executing snapshot code.
  const runtimeBytes = runtimeRoot
    ? undefined
    : await downloadSnapshot(snapshots.runtime, fetcher);
  const lensoBytes = await downloadSnapshot(snapshots.lenso, fetcher);
  const runtime = join(temporary, "runtime");
  const lenso = join(temporary, "lenso");
  let local;
  if (runtimeRoot) {
    await mkdir(runtime);
    local = await copyLocalRuntime(runtimeRoot, runtime);
  } else {
    await extract(runtimeBytes, snapshots.runtime, runtime);
  }
  await extract(lensoBytes, snapshots.lenso, lenso);
  return { lenso, runtime, runtimeProvenance: local ?? snapshots.runtime };
};

export const prepareRuntimeDeps = async (
  directory = resolve(import.meta.dir, "../.."),
  injected = {},
  options = {}
) => {
  const root = resolve(directory);
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf-8")
  );
  if (
    manifest.name !== "lenso-console-workspace" ||
    manifest.private !== true
  ) {
    throw new Error("Preparation root must be lenso-console-workspace");
  }
  if (Bun.version !== "1.4.3") {
    throw new Error("Runtime dependency preparation requires Bun 1.4.3");
  }
  const snapshots = injected.snapshots ?? pins;
  const output = await ownedOutput(root);
  const lock = join(output, ".prepare-lock");
  await mkdir(lock);
  let temporary;
  try {
    for (const name of outputs) {
      const previous = await stat(join(output, name));
      if (
        previous &&
        (previous.isSymbolicLink() ||
          (name === "provenance.json"
            ? !previous.isFile()
            : !previous.isDirectory()))
      ) {
        throw new Error(`Refusing to replace unexpected ${name}`);
      }
    }
    temporary = await mkdtemp(join(output, ".prepare-"));
    const { lenso, runtime, runtimeProvenance } = await stageSources(
      temporary,
      snapshots,
      injected.fetch,
      options.runtimeRoot
    );
    const run = injected.run ?? execute;
    await run(["install", "--frozen-lockfile", "--ignore-scripts"], runtime);
    const sdkSource = join(runtime, "sdk/typescript");
    await run(
      [
        "build",
        "index.ts",
        "schema.ts",
        "--outdir",
        "dist",
        "--target",
        "bun",
        "--packages",
        "external",
        "--splitting",
      ],
      sdkSource
    );
    await run(
      [
        join(runtime, "node_modules/typescript/bin/tsc"),
        "-p",
        "tsconfig.build.json",
      ],
      sdkSource
    );
    const sdkFiles = await packageArtifact(
      sdkSource,
      join(temporary, "sdk"),
      "@lenso/runtime-sdk",
      ["index", "schema"]
    );

    const adapterBuild = join(temporary, "adapter-build");
    await mkdir(adapterBuild);
    await cp(join(lenso, "packages/runtime/src"), join(adapterBuild, "src"), {
      recursive: true,
    });
    // Preserve the pinned compiler settings without the Lenso workspace/source closure.
    await cp(
      join(lenso, "tsconfig.json"),
      join(adapterBuild, "tsconfig.base.json")
    );
    const config = JSON.parse(
      await readFile(
        join(lenso, "packages/runtime/tsconfig.build.json"),
        "utf-8"
      )
    );
    config.extends = "./tsconfig.base.json";
    await writeFile(
      join(adapterBuild, "tsconfig.build.json"),
      `${JSON.stringify(config, null, 2)}\n`
    );
    await writeFile(
      join(adapterBuild, "package.json"),
      `${JSON.stringify(pins.bootstrap, null, 2)}\n`
    );
    // Compiler resolutions come from the authenticated Runtime lock. Only the
    // published adapter dependencies need additional reviewed lock entries.
    const runtimeLock = Bun.JSONC.parse(
      await readFile(join(runtime, "bun.lock"), "utf-8")
    );
    const bootstrapLock = {
      configVersion: runtimeLock.configVersion,
      lockfileVersion: runtimeLock.lockfileVersion,
      packages: { ...runtimeLock.packages, ...bootstrapPackages },
      workspaces: {
        "": {
          dependencies: pins.bootstrap.dependencies,
          devDependencies: pins.bootstrap.devDependencies,
          name: pins.bootstrap.name,
        },
      },
    };
    const bootstrapLockText = `${JSON.stringify(bootstrapLock, null, 2)}\n`;
    await writeFile(join(adapterBuild, "bun.lock"), bootstrapLockText);
    await run(
      ["install", "--frozen-lockfile", "--ignore-scripts"],
      adapterBuild
    );
    await run(
      [
        "build",
        "src/index.ts",
        "src/engine.ts",
        "src/manage.ts",
        "--outdir",
        "dist",
        "--target",
        "bun",
        "--packages",
        "external",
        "--splitting",
      ],
      adapterBuild
    );
    await run(
      [
        join(adapterBuild, "node_modules/typescript/bin/tsc"),
        "-p",
        "tsconfig.build.json",
      ],
      adapterBuild
    );
    await cp(
      join(lenso, "packages/runtime/package.json"),
      join(adapterBuild, "package.json")
    );
    const adapterFiles = await packageArtifact(
      adapterBuild,
      join(temporary, "adapter"),
      "@lenso/runtime",
      ["index", "engine", "manage"],
      {
        "@lenso/core": pins.bootstrap.dependencies["@lenso/core"],
        "@standard-schema/spec":
          pins.bootstrap.dependencies["@standard-schema/spec"],
      }
    );
    // Keep verified Rust fixture sources, not installation caches or SDK build output.
    await rm(join(runtime, "node_modules"), { force: true, recursive: true });
    await rm(join(runtime, ".bun-cache"), { force: true, recursive: true });
    await rm(join(sdkSource, "dist"), { force: true, recursive: true });
    await writeFile(
      join(temporary, "provenance.json"),
      `${JSON.stringify(
        {
          bootstrapLockSha256: hash(bootstrapLockText),
          bun: Bun.version,
          files: { adapter: adapterFiles, sdk: sdkFiles },
          lenso: snapshots.lenso,
          runtime: runtimeProvenance,
        },
        null,
        2
      )}\n`
    );
    const moved = [];
    const installed = [];
    try {
      for (const name of outputs) {
        if (await stat(join(output, name))) {
          await rename(join(output, name), join(temporary, `previous-${name}`));
          moved.push(name);
        }
        await rename(join(temporary, name), join(output, name));
        installed.push(name);
      }
    } catch (error) {
      for (const name of installed.toReversed()) {
        await rename(join(output, name), join(temporary, name));
      }
      for (const name of moved.toReversed()) {
        await rename(join(temporary, `previous-${name}`), join(output, name));
      }
      throw error;
    }
  } finally {
    if (temporary) {
      await rm(temporary, { force: true, recursive: true });
    }
    await rm(lock, { recursive: true });
  }
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = new Map();
  let valid = args.length % 2 === 0;
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--root", "--runtime-root"].includes(key) ||
      options.has(key) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    ) {
      valid = false;
    }
    options.set(key, args[i + 1]);
  }
  if (valid) {
    try {
      await prepareRuntimeDeps(
        options.get("--root"),
        {},
        { runtimeRoot: options.get("--runtime-root") }
      );
      console.log(
        "Prepared .runtime-deps/sdk, .runtime-deps/adapter and verified .runtime-deps/runtime sources"
      );
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Runtime dependency preparation failed"
      );
      process.exitCode = 1;
    }
  } else {
    console.error(
      "Usage: bun tooling/distribution/prepare-runtime-deps.mjs [--root <console-workspace>] [--runtime-root <runtime-checkout>]"
    );
    process.exitCode = 1;
  }
}
