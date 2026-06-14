import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const runtimeConsoleRoot = path.resolve(import.meta.dirname, "..");
const kitDir = path.join(runtimeConsoleRoot, "packages/remote-module-kit");
const kitPackageJsonPath = path.join(kitDir, "package.json");

const readJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf-8"));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async (command, args, options = {}) => {
  const { stdout } = await execFileAsync(command, args, {
    cwd: runtimeConsoleRoot,
    maxBuffer: 1024 * 1024 * 10,
    ...options,
  });
  return stdout;
};

const assertRemoteModuleKitMetadata = async () => {
  const manifest = await readJson(kitPackageJsonPath);

  assert(manifest.private !== true, "remote-module-kit must not be private");
  assert(
    manifest.publishConfig?.access === "public",
    "remote-module-kit publishConfig.access must be public"
  );
  assert(
    manifest.publishConfig?.registry === "https://registry.npmjs.org/",
    "remote-module-kit publishConfig.registry must target npmjs.org"
  );
  assert(
    manifest.main === "./dist/index.js",
    "remote-module-kit main must point at dist/index.js"
  );
  assert(
    manifest.types === "./dist/index.d.ts",
    "remote-module-kit types must point at dist/index.d.ts"
  );
  assert(
    manifest.exports?.["."]?.default === "./dist/index.js",
    "remote-module-kit exports.default must point at dist/index.js"
  );
  assert(
    manifest.exports?.["."]?.types === "./dist/index.d.ts",
    "remote-module-kit exports.types must point at dist/index.d.ts"
  );
  assert(
    manifest.files?.includes("dist"),
    "remote-module-kit files must include dist"
  );
};

const assertPackContents = (packOutput) => {
  const [pack] = JSON.parse(packOutput);
  const files = pack.files.map((entry) => entry.path).toSorted();
  const required = [
    "README.md",
    "dist/index.d.ts",
    "dist/index.js",
    "package.json",
  ];
  const forbidden = files.filter(
    (filePath) =>
      filePath.startsWith("src/") ||
      filePath.startsWith("node_modules/") ||
      filePath === "tsconfig.build.json" ||
      filePath.endsWith(".tsbuildinfo")
  );
  const missing = required.filter((filePath) => !files.includes(filePath));

  assert(
    missing.length === 0,
    `remote-module-kit package is missing expected files: ${missing.join(", ")}`
  );
  assert(
    forbidden.length === 0,
    `remote-module-kit package includes unexpected files: ${forbidden.join(", ")}`
  );

  console.log(
    `@lenso/remote-module-kit pack dry-run: ${files.length} files, ${pack.unpackedSize} unpacked bytes`
  );
};

const assertInstallSmoke = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lenso-kit-pack-"));
  let tarballPath;
  try {
    const packOutput = await execFileAsync("npm", ["pack", "--json"], {
      cwd: kitDir,
      maxBuffer: 1024 * 1024 * 10,
    });
    const [pack] = JSON.parse(packOutput.stdout);
    tarballPath = path.join(kitDir, pack.filename);
    const smokePackageJson = {
      dependencies: {
        "@lenso/remote-module-kit": tarballPath,
      },
      name: "lenso-remote-module-kit-smoke",
      private: true,
      scripts: {
        smoke: "node smoke.mjs",
      },
      type: "module",
      version: "0.0.0",
    };
    await writeFile(
      path.join(tempRoot, "package.json"),
      `${JSON.stringify(smokePackageJson, null, 2)}\n`
    );
    await writeFile(
      path.join(tempRoot, "smoke.mjs"),
      `import { defineRemoteModule, runtimeFunction } from "@lenso/remote-module-kit";

const manifest = defineRemoteModule({
  name: "smoke",
  runtimeFunctions: [runtimeFunction("smoke.run.v1")],
});

if (manifest.runtime.functions[0]?.name !== "smoke.run.v1") {
  throw new Error("remote-module-kit import did not work");
}
`
    );
    await execFileAsync("pnpm", ["install", "--silent"], {
      cwd: tempRoot,
      maxBuffer: 1024 * 1024 * 10,
    });
    await execFileAsync("pnpm", ["smoke"], {
      cwd: tempRoot,
      maxBuffer: 1024 * 1024 * 10,
    });
  } finally {
    if (tarballPath) {
      await rm(tarballPath, { force: true });
    }
    await rm(tempRoot, { force: true, recursive: true });
  }
};

console.log("Checking @lenso/remote-module-kit publish metadata...");
await assertRemoteModuleKitMetadata();

console.log("Building @lenso/remote-module-kit...");
await run("pnpm", ["--filter", "@lenso/remote-module-kit", "build"]);

console.log("Dry-running npm pack for @lenso/remote-module-kit...");
const packDryRunOutput = await execFileAsync(
  "npm",
  ["pack", "--dry-run", "--json"],
  {
    cwd: kitDir,
    maxBuffer: 1024 * 1024 * 10,
  }
);
assertPackContents(packDryRunOutput.stdout);

console.log("Installing @lenso/remote-module-kit from a packed tarball...");
await assertInstallSmoke();

console.log("Package readiness checks passed.");
