import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ConsolePackageReference,
  PendingWrites,
  RemoteModuleEntry,
  RepoPaths,
  RuntimeConsolePaths,
} from "./types";

export const hasExitCode = (error: unknown): error is { exitCode: number } =>
  typeof error === "object" &&
  error !== null &&
  "exitCode" in error &&
  typeof (error as { exitCode?: unknown }).exitCode === "number";

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf-8"));

export const readJsonFromReference = async (
  reference: string
): Promise<unknown> => {
  if (reference.startsWith("file:")) {
    return readJson(fileURLToPath(reference));
  }
  if (reference.startsWith("http://") || reference.startsWith("https://")) {
    const response = await fetch(reference);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch module manifest: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  }
  return readJson(path.resolve(reference));
};

export const queueWrite = (
  pendingWrites: PendingWrites,
  filePath: string,
  content: string
) => {
  pendingWrites.set(filePath, content);
};

export const writePendingFiles = async (pendingWrites: PendingWrites) => {
  for (const [filePath, content] of pendingWrites) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
};

export const insertBeforeNeedle = (
  fileSource: string,
  entry: string,
  needle: string
) => {
  if (fileSource.includes(entry.trim())) {
    return fileSource;
  }
  const index = fileSource.indexOf(needle);
  if (index === -1) {
    throw new Error(`Could not find insertion point: ${needle}`);
  }
  return `${fileSource.slice(0, index)}${entry}${fileSource.slice(index)}`;
};

export const insertBeforeFirstNeedle = (
  fileSource: string,
  entry: string,
  needles: string[]
) => {
  if (fileSource.includes(entry.trim())) {
    return fileSource;
  }
  for (const needle of needles) {
    if (fileSource.includes(needle)) {
      return insertBeforeNeedle(fileSource, entry, needle);
    }
  }
  return `${fileSource.trimEnd()}\n${entry}`;
};

export const insertIntoLinkedModuleEntries = (
  fileSource: string,
  entry: string
) => {
  if (fileSource.includes(entry.trim())) {
    return fileSource;
  }
  const entriesStart = fileSource.indexOf("const LINKED_MODULE_ENTRIES");
  if (entriesStart === -1) {
    throw new Error("Could not find LINKED_MODULE_ENTRIES in app-bootstrap");
  }
  const entriesEnd = fileSource.indexOf("];", entriesStart);
  if (entriesEnd === -1) {
    throw new Error("Could not find LINKED_MODULE_ENTRIES closing bracket");
  }
  return `${fileSource.slice(0, entriesEnd)}${entry}${fileSource.slice(
    entriesEnd
  )}`;
};

export const appendToken = (
  value: string,
  token: string,
  beforeToken: string
) => {
  const tokens = value.split(" ");
  if (tokens.includes(token)) {
    return value;
  }
  const beforeIndex = tokens.indexOf(beforeToken);
  if (beforeIndex === -1) {
    return [...tokens, token].join(" ");
  }
  return [
    ...tokens.slice(0, beforeIndex),
    token,
    ...tokens.slice(beforeIndex),
  ].join(" ");
};

export const appendListItem = <T>(items: T[], item: T) =>
  items.includes(item) ? items : [...items, item];

export const parseRemoteModuleEntries = (value: string): RemoteModuleEntry[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, ...baseUrlParts] = entry.split("=");
      return {
        baseUrl: baseUrlParts.join("=").trim(),
        name: (name ?? "").trim(),
      };
    })
    .filter((entry) => entry.name && entry.baseUrl);

export const formatRemoteModuleEntries = (entries: RemoteModuleEntry[]) =>
  entries.map((entry) => `${entry.name}=${entry.baseUrl}`).join(",");

export const consolePackageKey = ({
  exportName,
  packageName,
}: ConsolePackageReference) => `${packageName}#${exportName}`;

export const sortObject = <T>(object: Record<string, T>) =>
  Object.fromEntries(
    Object.entries(object).toSorted(([left], [right]) =>
      left.localeCompare(right)
    )
  ) as Record<string, T>;

export const camelCase = (value: string) =>
  value.replaceAll(/-([a-z0-9])/gu, (_match: string, letter: string) =>
    letter.toUpperCase()
  );

export const snakeCase = (value: string) => value.replaceAll("-", "_");

export const pascalCase = (value: string) => {
  const camel = camelCase(value);
  return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
};

export const exportStemFromPackageSlug = (packageSlugValue: string) => {
  const normalized = packageSlugValue.replace(/-console$/u, "");
  return `${camelCase(normalized)}Console`;
};

export const rustConsoleArea = (areaName: string) => {
  const areaByName: Record<string, string> = {
    configuration: "Configuration",
    data: "Data",
    operations: "Operations",
    runtime: "Runtime",
  };
  const rustArea = areaByName[areaName];
  if (!rustArea) {
    throw new Error(`Unsupported console surface area: ${areaName}`);
  }
  return rustArea;
};

export const titleCase = (value: string) =>
  value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

export const defaultIcon = (areaName: string) =>
  areaName === "runtime" ? "workflow" : "database";

export const pathExists = async (filePath: string) => {
  try {
    await stat(filePath);
    return true;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

export const readTextIfExists = async (filePath: string) =>
  (await pathExists(filePath)) ? readFile(filePath, "utf-8") : "";

export const upsertEnvValue = (source: string, key: string, value: string) => {
  const lines = source ? source.split("\n") : [];
  const keyPrefix = `${key}=`;
  const index = lines.findIndex((line) => line.startsWith(keyPrefix));
  if (index === -1) {
    const trimmed = source.trimEnd();
    return `${trimmed ? `${trimmed}\n` : ""}${key}=${value}\n`;
  }
  lines[index] = `${key}=${value}`;
  return `${lines.join("\n").replaceAll(/\n+$/gu, "")}\n`;
};

export const findRepoRoot = async (startPath: string) => {
  let current = path.resolve(startPath);
  while (true) {
    if (
      (await pathExists(path.join(current, "Cargo.toml"))) &&
      (await pathExists(path.join(current, "crates/app-bootstrap")))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startPath);
    }
    current = parent;
  }
};

export const relativePath = (runtimeConsoleRoot: string, filePath: string) =>
  path.relative(runtimeConsoleRoot, filePath);

export const runtimeConsolePaths = (
  runtimeConsoleRoot: string
): RuntimeConsolePaths => ({
  manifestExportsPath: path.join(
    runtimeConsoleRoot,
    "src/console-package-manifest-exports.ts"
  ),
  moduleExportsPath: path.join(
    runtimeConsoleRoot,
    "src/console-package-module-exports.ts"
  ),
  oxlintConfigPath: path.join(runtimeConsoleRoot, "oxlint.config.ts"),
  packageJsonPath: path.join(runtimeConsoleRoot, "package.json"),
  tsconfigPath: path.join(runtimeConsoleRoot, "tsconfig.json"),
  viteConfigPath: path.join(runtimeConsoleRoot, "vite.config.ts"),
});

export const defaultRuntimeConsoleRootForRepo = async (repoRoot: string) => {
  if (
    await pathExists(
      path.join(repoRoot, "src/console-package-module-exports.ts")
    )
  ) {
    return repoRoot;
  }
  if (
    await pathExists(
      path.join(
        repoRoot,
        "apps/runtime-console/src/console-package-module-exports.ts"
      )
    )
  ) {
    return path.join(repoRoot, "apps/runtime-console");
  }
  if (
    await pathExists(
      path.join(process.cwd(), "src/console-package-module-exports.ts")
    )
  ) {
    return process.cwd();
  }
  return path.join(repoRoot, "apps/runtime-console");
};

export const repoPaths = (repoRoot: string): RepoPaths => ({
  appBootstrapCargoTomlPath: path.join(
    repoRoot,
    "crates/app-bootstrap/Cargo.toml"
  ),
  appBootstrapLibPath: path.join(repoRoot, "crates/app-bootstrap/src/lib.rs"),
  cargoTomlPath: path.join(repoRoot, "Cargo.toml"),
});
