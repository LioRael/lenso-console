/* eslint-disable func-style, sort-keys, unicorn/no-array-sort */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const createTemporaryRoot = async (moduleId) => {
  const safeId = moduleId.replaceAll(/[^a-z0-9_-]+/giu, "-");
  const path = join(tmpdir(), `lenso-console-module-${safeId}-${process.pid}`);
  await rm(path, { force: true, recursive: true });
  await mkdir(path, { recursive: true });
  return path;
};

const isDigest = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);

const parseReleaseDigests = (value) => {
  if (!value) {
    throw new Error(
      "LENSO_MODULE_RELEASE_DIGESTS must be a JSON object keyed by Module ID"
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("LENSO_MODULE_RELEASE_DIGESTS must contain valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LENSO_MODULE_RELEASE_DIGESTS must be a JSON object");
  }
  return parsed;
};

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(
  process.env.LENSO_CONSOLE_MODULE_ARTIFACT_DIR ??
    join(root, "dist", "console-module-artifacts")
);
const releaseDigests = parseReleaseDigests(
  process.env.LENSO_MODULE_RELEASE_DIGESTS
);
const locatorBase = process.env.LENSO_CONSOLE_MODULE_ARTIFACT_BASE_URL;

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relative = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relative)));
    } else if (entry.isFile()) {
      files.push(relative.replaceAll("\\", "/"));
    }
  }
  return files;
}

const modules = [
  {
    entry: "packages/story-console/src/index.tsx",
    id: "lenso/platform-story",
    manifest: "packages/story-console/console-module.json",
  },
  {
    entry: "packages/system-registry-console/src/index.tsx",
    id: "lenso/system-registry",
    manifest: "packages/system-registry-console/console-module.json",
  },
];

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

const artifacts = [];
for (const module of modules) {
  const releaseDigest = releaseDigests[module.id];
  if (!isDigest(releaseDigest)) {
    throw new Error(
      `LENSO_MODULE_RELEASE_DIGESTS must include ${module.id} with a sha256:<64 hex> digest`
    );
  }
  const manifest = JSON.parse(
    await readFile(join(root, module.manifest), "utf-8")
  );
  if (manifest.moduleId !== module.id) {
    throw new Error(`manifest identity mismatch for ${module.id}`);
  }
  const temporaryRoot = await createTemporaryRoot(module.id);
  const packageRoot = join(temporaryRoot, "package");
  try {
    await build({
      build: {
        emptyOutDir: true,
        lib: {
          entry: join(root, module.entry),
          fileName: () => "index.js",
          formats: ["es"],
        },
        outDir: join(packageRoot, "dist"),
        rolldownOptions: {
          output: {
            assetFileNames: "assets/[name][extname]",
            chunkFileNames: "chunks/[name]-[hash].js",
            entryFileNames: "index.js",
          },
        },
      },
      configFile: false,
      plugins: [
        react(),
        stylex({
          aliases: {
            "@lenso/console-tokens/tokens.stylex": [
              join(
                root,
                "packages",
                "console-tokens",
                "src",
                "tokens.stylex.ts"
              ),
            ],
          },
          useCSSLayers: true,
          devMode: "off",
        }),
      ],
      publicDir: false,
      resolve: {
        alias: [
          {
            find: /^react\/jsx-runtime$/u,
            replacement: join(
              root,
              "scripts",
              "console-react-runtime-shim.mjs"
            ),
          },
          {
            find: /^react$/u,
            replacement: join(
              root,
              "scripts",
              "console-react-runtime-shim.mjs"
            ),
          },
          {
            find: "@lenso/console-module-api",
            replacement: join(
              root,
              "packages",
              "console-module-api",
              "src",
              "index.ts"
            ),
          },
          {
            find: "@lenso/console-ui",
            replacement: join(
              root,
              "packages",
              "console-ui",
              "src",
              "index.tsx"
            ),
          },
          {
            find: /^@lenso\/console-tokens\/tokens\.stylex$/u,
            replacement: join(
              root,
              "packages",
              "console-tokens",
              "src",
              "tokens.stylex.ts"
            ),
          },
          {
            find: "@lenso/console-tokens",
            replacement: join(
              root,
              "packages",
              "console-tokens",
              "src",
              "index.ts"
            ),
          },
        ],
      },
      root,
    });

    const archiveName = `${module.id.replaceAll("/", "-")}.tar.gz`;
    const archivePath = join(outputRoot, archiveName);
    execFileSync("tar", ["-czf", archivePath, "-C", temporaryRoot, "package"]);
    const bytes = await readFile(archivePath);
    const artifactDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const locator = locatorBase
      ? `${locatorBase.replace(/\/+$/u, "")}/${archiveName}`
      : null;
    const distRoot = join(packageRoot, "dist");
    const outputFiles = await listFiles(distRoot);
    const styleAssets = outputFiles
      .filter((file) => file.endsWith(".css"))
      .sort()
      .map((path, order) => ({ order, path }));
    const entries = [
      { name: "module", path: "index.js" },
      ...styleAssets.map((asset) => ({
        name: `style-${asset.order}`,
        path: asset.path,
      })),
    ];
    artifacts.push({
      artifactDigest,
      artifactFile: archiveName,
      entries,
      entry: "index.js",
      format: "console_ui_esm",
      locator,
      manifest,
      moduleId: module.id,
      moduleReleaseDigest: releaseDigest,
      requestedPermissions: [],
      styleAssets,
    });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

await writeFile(
  join(outputRoot, "artifact-index.json"),
  `${JSON.stringify({ artifacts }, null, 2)}\n`,
  "utf-8"
);
console.log(
  `Built ${artifacts.length} Console UI ESM artifacts in ${outputRoot}`
);
