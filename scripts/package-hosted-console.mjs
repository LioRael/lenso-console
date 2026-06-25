import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf-8")
);
const version =
  process.env.LENSO_RUNTIME_CONSOLE_VERSION ?? packageJson.version;
const outDir = path.resolve(
  root,
  process.env.LENSO_RUNTIME_CONSOLE_ARTIFACT_DIR ?? "dist/release"
);
const packageRoot = path.resolve(
  root,
  process.env.LENSO_RUNTIME_CONSOLE_PACKAGE_ROOT ?? "build/hosted-console"
);
const archive = path.join(outDir, "lenso-runtime-console.tar.gz");
const checksum = `${archive}.sha256`;
const distRoot = path.join(root, "dist");

const exists = async (filePath) => {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

if (!(await exists(path.join(distRoot, "index.html")))) {
  throw new Error("dist/index.html is missing; run pnpm build:local first");
}

await rm(packageRoot, { force: true, recursive: true });
await mkdir(path.join(packageRoot, "extensions"), { recursive: true });
await cp(distRoot, path.join(packageRoot, "dist"), {
  filter: (source) => {
    const resolved = path.resolve(source);
    return resolved !== outDir && !resolved.startsWith(`${outDir}${path.sep}`);
  },
  recursive: true,
});

const hostExtensions = path.join(root, "dist/extensions/host");
if (await exists(hostExtensions)) {
  await cp(hostExtensions, path.join(packageRoot, "extensions/host"), {
    recursive: true,
  });
}

await writeFile(
  path.join(packageRoot, "extensions/registry.json"),
  '{"version":1,"bundles":[]}\n'
);
await writeFile(
  path.join(packageRoot, "manifest.json"),
  `${JSON.stringify(
    {
      name: "lenso-runtime-console",
      version,
    },
    null,
    2
  )}\n`
);

await mkdir(outDir, { recursive: true });
await rm(archive, { force: true });
await rm(checksum, { force: true });
const tar = spawnSync("tar", ["-czf", archive, "-C", packageRoot, "."], {
  cwd: root,
  stdio: "inherit",
});
if (tar.status !== 0) {
  process.exit(tar.status ?? 1);
}

const digest = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
await writeFile(checksum, `${digest}  ${path.basename(archive)}\n`);
await rm(packageRoot, { force: true, recursive: true });

console.log(`packed ${path.relative(root, archive)}`);
