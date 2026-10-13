import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  downloadSnapshot,
  prepareRuntimeDeps,
} from "./prepare-runtime-deps.mjs";
import pins from "./runtime-deps.json";

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

const rootFixture = async () => {
  const root = await mkdtemp(
    join(process.env.DELTA_SCRATCH_DIR ?? tmpdir(), "console-runtime-prep-")
  );
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "lenso-console-workspace",
      private: true,
    })
  );
  return root;
};

const sdkManifest = {
  exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" } },
  files: ["dist"],
  name: "@lenso/runtime-sdk",
  scripts: { build: "must not survive" },
  version: "0.1.0",
};
const adapterManifest = {
  dependencies: { "@lenso/core": "workspace:^" },
  devDependencies: { "@lenso/engine": "workspace:^" },
  files: ["dist"],
  name: "@lenso/runtime",
  peerDependencies: { "@lenso/runtime-sdk": "0.1.0" },
  scripts: { build: "must not execute" },
  version: "0.1.0",
};
const snapshot = async (pin, files) => {
  const prefix = `${pin.repo}-${pin.commit}/`;
  const bytes = Bun.gzipSync(
    await new Bun.Archive(
      Object.fromEntries(
        Object.entries(files).map(([path, contents]) => [
          prefix + path,
          contents,
        ])
      )
    ).bytes()
  );
  return {
    bytes,
    pin: { ...pin, sha256: createHash("sha256").update(bytes).digest("hex") },
  };
};
const runtime = await snapshot(pins.runtime, {
  "bun.lock": JSON.stringify({
    configVersion: 1,
    lockfileVersion: 2,
    packages: {},
  }),
  "crates/runtime/src/lib.rs": "// verified fixture source",
  "sdk/typescript/package.json": JSON.stringify(sdkManifest),
});
const lenso = await snapshot(pins.lenso, {
  "packages/runtime/package.json": JSON.stringify(adapterManifest),
  "packages/runtime/src/index.ts": "export {}",
  "packages/runtime/tsconfig.build.json": JSON.stringify({
    compilerOptions: {},
    include: ["src/**/*.ts"],
  }),
  "tsconfig.json": "{}",
});
const snapshots = { lenso: lenso.pin, runtime: runtime.pin };
const fetchFixture = (url, options) => {
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
  return new Response(
    String(url).includes("lenso-runtime/") ? runtime.bytes : lenso.bytes
  );
};

const buildFixture = async (args, cwd, missing) => {
  if (args[0] === "install") {
    expect(args).toEqual(["install", "--frozen-lockfile", "--ignore-scripts"]);
    return;
  }
  const adapter = cwd.endsWith("adapter-build");
  const entries = adapter ? ["index", "engine", "manage"] : ["index", "schema"];
  await mkdir(join(cwd, "dist"), { recursive: true });
  for (const entry of entries) {
    for (const extension of ["js", "d.ts"]) {
      const file = `${entry}.${extension}`;
      if (file !== missing) {
        await writeFile(join(cwd, "dist", file), `// ${file}`);
      }
    }
  }
};

test("checksum and byte bounds reject before any snapshot command executes", async () => {
  const root = await rootFixture();
  let commands = 0;
  await expect(
    prepareRuntimeDeps(root, {
      fetch: () => new Response("corrupt"),
      run: () => {
        commands += 1;
      },
    })
  ).rejects.toThrow("checksum mismatch");
  expect(commands).toBe(0);
  const initialFiles = await readdir(join(root, ".runtime-deps"));
  expect(initialFiles.toSorted()).toEqual([".owner"]);
  await expect(
    downloadSnapshot(
      pins.runtime,
      () =>
        new Response("tiny", {
          headers: { "content-length": String(21 * 1024 * 1024) },
        })
    )
  ).rejects.toThrow("byte limit");
  await expect(
    downloadSnapshot(
      pins.runtime,
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(21 * 1024 * 1024));
              controller.close();
            },
          })
        )
    )
  ).rejects.toThrow("byte limit");
});

test("clean bootstrap emits public packages, published dependency lock and retained source", async () => {
  const root = await rootFixture();
  const commands = [];
  await prepareRuntimeDeps(root, {
    fetch: fetchFixture,
    run: async (args, cwd) => {
      expect(cwd.startsWith(join(root, ".runtime-deps/.prepare-"))).toBe(true);
      commands.push(args);
      if (cwd.endsWith("adapter-build") && args[0] === "install") {
        const manifest = JSON.parse(
          await readFile(join(cwd, "package.json"), "utf-8")
        );
        expect(manifest).toEqual(pins.bootstrap);
        const lock = JSON.parse(await readFile(join(cwd, "bun.lock"), "utf-8"));
        expect(lock.packages["@lenso/core"][0]).toBe("@lenso/core@0.3.1");
        expect(lock.workspaces[""].dependencies["@lenso/engine"]).toBe("0.6.0");
      }
      await buildFixture(args, cwd);
    },
    snapshots,
  });
  expect(commands).toHaveLength(6);
  expect(
    commands.some((args) => args.includes("run") || args.includes("cargo"))
  ).toBe(false);
  const output = join(root, ".runtime-deps");
  const outputFiles = await readdir(output);
  expect(outputFiles.toSorted()).toEqual([
    ".owner",
    "adapter",
    "provenance.json",
    "runtime",
    "sdk",
  ]);
  for (const name of ["sdk", "adapter"]) {
    const packageFiles = await readdir(join(output, name));
    expect(packageFiles.toSorted()).toEqual(["dist", "package.json"]);
    const manifest = JSON.parse(
      await readFile(join(output, name, "package.json"), "utf-8")
    );
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
  }
  expect(
    JSON.parse(await readFile(join(output, "adapter/package.json"), "utf-8"))
      .dependencies["@lenso/core"]
  ).toBe("0.3.1");
  expect(
    await readFile(join(output, "runtime/crates/runtime/src/lib.rs"), "utf-8")
  ).toContain("verified");
});

test("failed bootstrap and missing SDK/adapter artifacts preserve the previous ready transaction", async () => {
  const root = await rootFixture();
  const injection = { fetch: fetchFixture, run: buildFixture, snapshots };
  await prepareRuntimeDeps(root, injection);
  const output = join(root, ".runtime-deps");
  const before = await readFile(join(output, "provenance.json"), "utf-8");
  for (const failure of ["bootstrap", "schema.d.ts", "manage.js"]) {
    await expect(
      prepareRuntimeDeps(root, {
        ...injection,
        run: async (args, cwd) => {
          if (failure === "bootstrap" && cwd.endsWith("adapter-build")) {
            throw new Error("bootstrap failed");
          }
          await buildFixture(args, cwd, failure);
        },
      })
    ).rejects.toThrow(
      failure === "bootstrap" ? "bootstrap failed" : `missing dist/${failure}`
    );
    expect(await readFile(join(output, "provenance.json"), "utf-8")).toBe(
      before
    );
    expect(
      await readFile(join(output, "sdk/dist/schema.d.ts"), "utf-8")
    ).toContain("schema.d.ts");
    expect(
      await readFile(join(output, "adapter/dist/manage.js"), "utf-8")
    ).toContain("manage.js");
    const remainingFiles = await readdir(output);
    expect(remainingFiles.toSorted()).toEqual([
      ".owner",
      "adapter",
      "provenance.json",
      "runtime",
      "sdk",
    ]);
  }
});

test("local Runtime uses dirty tracked SDK bytes while retaining the pinned adapter", async () => {
  const root = await rootFixture();
  const local = await rootFixture();
  await writeFile(
    join(local, "package.json"),
    JSON.stringify({ name: "lenso-runtime-workspace", private: true })
  );
  const archive = new Bun.Archive(Bun.gunzipSync(runtime.bytes));
  for (const [name, file] of await archive.files()) {
    const path = name.slice(`lenso-runtime-${runtime.pin.commit}/`.length);
    await mkdir(join(local, path, ".."), { recursive: true });
    await writeFile(join(local, path), await file.bytes());
  }
  await writeFile(join(local, "sdk/typescript/index.ts"), "first");
  for (const args of [
    ["init", "-q"],
    ["add", "."],
  ]) {
    expect(await Bun.spawn(["git", ...args], { cwd: local }).exited).toBe(0);
  }
  await writeFile(join(local, ".env"), "secret");
  await writeFile(join(local, "sdk/typescript/untracked.ts"), "untracked");
  await mkdir(join(local, "crates/sdk/tests"), { recursive: true });
  await writeFile(join(local, "crates/sdk/tests/schema-cases.json"), "[]");
  const prepare = () =>
    prepareRuntimeDeps(
      root,
      {
        fetch: (url, options) => {
          expect(String(url)).not.toContain("lenso-runtime/");
          return fetchFixture(url, options);
        },
        run: async (args, cwd) => {
          await buildFixture(args, cwd);
          if (cwd.endsWith("sdk/typescript") && args[0] !== "install") {
            await writeFile(
              join(cwd, "dist/index.js"),
              await readFile(join(cwd, "index.ts"))
            );
          }
        },
        snapshots,
      },
      { runtimeRoot: local }
    );
  await prepare();
  const output = join(root, ".runtime-deps");
  const before = JSON.parse(
    await readFile(join(output, "provenance.json"), "utf-8")
  );
  expect(before.runtime.kind).toBe("local");
  expect(before.runtime.commit).toBeUndefined();
  expect(before.runtime.files[".env"]).toBeUndefined();
  expect(before.runtime.files["sdk/typescript/untracked.ts"]).toBeUndefined();
  expect(
    before.runtime.files["crates/sdk/tests/schema-cases.json"]
  ).toBeDefined();
  await writeFile(join(local, "sdk/typescript/index.ts"), "dirty current");
  await prepare();
  const after = JSON.parse(
    await readFile(join(output, "provenance.json"), "utf-8")
  );
  expect(after.runtime.sha256).not.toBe(before.runtime.sha256);
  expect(after.files.sdk["dist/index.js"]).not.toBe(
    before.files.sdk["dist/index.js"]
  );
  expect(after.files.adapter).toEqual(before.files.adapter);
  expect(after.lenso).toEqual(lenso.pin);
  await rm(join(local, "sdk/typescript/index.ts"));
  await symlink(join(local, ".env"), join(local, "sdk/typescript/index.ts"));
  await expect(prepare()).rejects.toThrow("regular files");
  expect(
    JSON.parse(await readFile(join(output, "provenance.json"), "utf-8"))
  ).toEqual(after);
});

test("standalone CLI imports no installed Console packages and rejects unsupported source overrides", async () => {
  const root = await rootFixture();
  for (const name of [
    "prepare-runtime-deps.mjs",
    "runtime-deps.json",
    "runtime-deps.bootstrap.json",
  ]) {
    await cp(join(import.meta.dir, name), join(root, name));
  }
  const child = Bun.spawn(
    [
      process.execPath,
      join(root, "prepare-runtime-deps.mjs"),
      "--source",
      "/tmp/other",
    ],
    {
      cwd: root,
      stderr: "pipe",
      stdout: "pipe",
    }
  );
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited).toBe(1);
  expect(stderr).toContain("Usage:");
  expect(await readdir(root)).not.toContain("node_modules");
});
