import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const consoleRoot = path.resolve(import.meta.dirname, "..");

const packages = [
  {
    dir: path.join(consoleRoot, "packages/console-package-api"),
    name: "@lenso/console-package-api",
    requiredFiles: ["theme.css"],
    smokeBody: `const consoleManifest = defineConsolePackageManifest({
  area: "data",
  exportName: "smokeConsoleModule",
  id: "smoke-console",
  label: "Smoke",
  packageName: "@example/smoke-console",
  requiredCapabilities: [],
  route: "/smoke",
  source: "installed",
  surfaceName: "smoke",
});
const consoleModule = defineConsoleModule({
  id: consoleManifest.id,
  surfaces: [],
});

if (consoleModule.id !== "smoke-console") {
  throw new Error("console-package-api import did not work");
}`,
    smokeImport:
      'import { defineConsoleModule, defineConsolePackageManifest } from "@lenso/console-package-api";',
  },
  {
    dir: path.join(consoleRoot, "packages/remote-module-kit"),
    name: "@lenso/remote-module-kit",
    smokeBody: `const manifest = defineRemoteModule({
  name: "smoke",
  runtimeFunctions: [remoteRuntimeFunction("smoke.run.v1")],
});

if (manifest.runtime.functions[0]?.name !== "smoke.run.v1") {
  throw new Error("remote-module-kit import did not work");
}`,
    smokeImport:
      'import { defineRemoteModule, runtimeFunction as remoteRuntimeFunction } from "@lenso/remote-module-kit";',
  },
  {
    dir: path.join(consoleRoot, "packages/service-kit"),
    name: "@lenso/service-kit",
    smokeBody: `const module = defineModule({
  capabilities: ["smoke.records.read"],
  name: "smoke-records",
  runtimeFunctions: [serviceRuntimeFunction("smoke.records.sync.v1")],
});
const service = defineService({
  modules: [module],
  name: "smoke-service",
});

if (service.modules[0]?.name !== "smoke-records") {
  throw new Error("service-kit import did not work");
}`,
    smokeImport:
      'import { defineModule, defineService, runtimeFunction as serviceRuntimeFunction } from "@lenso/service-kit";',
  },
];

const readJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf-8"));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async (command, args, options = {}) => {
  const { stdout } = await execFileAsync(command, args, {
    cwd: consoleRoot,
    maxBuffer: 1024 * 1024 * 10,
    ...options,
  });
  return stdout;
};

const assertPackageMetadata = async ({ dir, name }) => {
  const manifest = await readJson(path.join(dir, "package.json"));

  assert(manifest.name === name, `${name} package name must match`);
  assert(manifest.private !== true, `${name} must not be private`);
  assert(manifest.license === "MIT", `${name} license must be MIT`);
  assert(
    manifest.publishConfig?.access === "public",
    `${name} publishConfig.access must be public`
  );
  assert(
    manifest.publishConfig?.registry === "https://registry.npmjs.org/",
    `${name} publishConfig.registry must target npmjs.org`
  );
  assert(
    manifest.main === "./dist/index.js",
    `${name} main must point at dist/index.js`
  );
  assert(
    manifest.types === "./dist/index.d.ts",
    `${name} types must point at dist/index.d.ts`
  );
  assert(
    manifest.exports?.["."]?.default === "./dist/index.js",
    `${name} exports.default must point at dist/index.js`
  );
  assert(
    manifest.exports?.["."]?.types === "./dist/index.d.ts",
    `${name} exports.types must point at dist/index.d.ts`
  );
  assert(manifest.files?.includes("dist"), `${name} files must include dist`);
};

const parsePnpmPackOutput = (packOutput) => {
  const jsonStart = packOutput.indexOf("{\n");
  assert(jsonStart !== -1, "pnpm pack did not print JSON output");
  return JSON.parse(packOutput.slice(jsonStart));
};

const assertNoWorkspaceDependencies = (packageName, manifest) => {
  const workspaceDependencies = Object.entries({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  }).filter(([, version]) => String(version).startsWith("workspace:"));
  assert(
    workspaceDependencies.length === 0,
    `${packageName} packed dependencies must not use workspace:*`
  );
};

const assertPackContents = (packageName, packOutput, requiredFiles = []) => {
  const pack = parsePnpmPackOutput(packOutput);
  const files = pack.files.map((entry) => entry.path).toSorted();
  const required = [
    "LICENSE",
    "README.md",
    "dist/index.d.ts",
    "dist/index.js",
    "package.json",
    ...requiredFiles,
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
    `${packageName} package is missing expected files: ${missing.join(", ")}`
  );
  assert(
    forbidden.length === 0,
    `${packageName} package includes unexpected files: ${forbidden.join(", ")}`
  );

  console.log(`${packageName} pack dry-run: ${files.length} files`);
};

const packPackage = async ({ dir }) => {
  const packOutput = await execFileAsync(
    "pnpm",
    ["pack", "--config.ignore-scripts=true", "--json"],
    {
      cwd: dir,
      maxBuffer: 1024 * 1024 * 10,
    }
  );
  const pack = parsePnpmPackOutput(packOutput.stdout);
  const tarballPath = path.join(dir, pack.filename);
  const packedManifestOutput = await execFileAsync(
    "tar",
    ["-xOf", tarballPath, "package/package.json"],
    {
      cwd: dir,
      maxBuffer: 1024 * 1024,
    }
  );
  assertNoWorkspaceDependencies(
    pack.name,
    JSON.parse(packedManifestOutput.stdout)
  );
  return tarballPath;
};

const assertInstallSmoke = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lenso-sdk-pack-"));
  const tarballs = [];
  try {
    for (const packageConfig of packages) {
      tarballs.push(await packPackage(packageConfig));
    }
    const tarballByPackage = Object.fromEntries(
      packages.map((packageConfig, index) => [
        packageConfig.name,
        tarballs[index],
      ])
    );

    const smokePackageJson = {
      dependencies: Object.fromEntries([
        ...Object.entries(tarballByPackage),
        ["react", "^19.1.0"],
      ]),
      name: "lenso-service-sdk-smoke",
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
      path.join(tempRoot, "pnpm-workspace.yaml"),
      `overrides:\n  "@lenso/remote-module-kit": "${tarballByPackage["@lenso/remote-module-kit"]}"\n`
    );
    await writeFile(
      path.join(tempRoot, "smoke.mjs"),
      `${packages.map((packageConfig) => packageConfig.smokeImport).join("\n")}

${packages.map((packageConfig) => packageConfig.smokeBody).join("\n\n")}
`
    );
    await execFileAsync("pnpm", ["install"], {
      cwd: tempRoot,
      maxBuffer: 1024 * 1024 * 10,
    });
    await execFileAsync("pnpm", ["smoke"], {
      cwd: tempRoot,
      maxBuffer: 1024 * 1024 * 10,
    });
  } finally {
    await Promise.all(
      tarballs.map((tarballPath) => rm(tarballPath, { force: true }))
    );
    await rm(tempRoot, { force: true, recursive: true });
  }
};

for (const packageConfig of packages) {
  console.log(`Checking ${packageConfig.name} publish metadata...`);
  await assertPackageMetadata(packageConfig);

  console.log(`Building ${packageConfig.name}...`);
  await run("pnpm", ["--filter", packageConfig.name, "build"]);

  console.log(`Dry-running pnpm pack for ${packageConfig.name}...`);
  const packDryRunOutput = await execFileAsync(
    "pnpm",
    ["pack", "--dry-run", "--config.ignore-scripts=true", "--json"],
    {
      cwd: packageConfig.dir,
      maxBuffer: 1024 * 1024 * 10,
    }
  );
  assertPackContents(
    packageConfig.name,
    packDryRunOutput.stdout,
    packageConfig.requiredFiles
  );
}

console.log("Installing public packages from packed tarballs...");
await assertInstallSmoke();

console.log("Package readiness checks passed.");
