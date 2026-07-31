/* eslint-disable func-style -- named release phases keep failures attributable */
/* eslint-disable no-bitwise -- O_NOFOLLOW and exclusive open flags are security requirements */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const groupNames = ["composition", "schema", "contract", "configuration"];

function fail(message) {
  throw new Error(`Console Service release: ${message}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).toSorted();
  const wanted = [...expected].toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} fields must be exactly ${wanted.join(", ")}`);
  }
}

function safeRelative(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`${label} contains an unsafe path`);
  }
  return value;
}

async function readRegularFile(root, relative) {
  const absoluteRoot = path.resolve(root);
  let current = absoluteRoot;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      fail(`symbolic link is forbidden: ${relative}`);
    }
  }
  if (!current.startsWith(`${absoluteRoot}${path.sep}`)) {
    fail(`path escaped repository root: ${relative}`);
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      fail(`release input is not a regular file: ${relative}`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function expandSource(root, relative, excludedSuffixes) {
  safeRelative(relative, "release input selector");
  const absolute = path.join(path.resolve(root), relative);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) {
    fail(`symbolic link is forbidden: ${relative}`);
  }
  if (metadata.isFile()) {
    return excludedSuffixes.some((suffix) => relative.endsWith(suffix))
      ? []
      : [relative];
  }
  if (!metadata.isDirectory()) {
    fail(`release input is not a file or directory: ${relative}`);
  }
  const files = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      fail(`symbolic link is forbidden: ${child}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await expandSource(root, child, excludedSuffixes)));
    } else if (
      entry.isFile() &&
      !excludedSuffixes.some((suffix) => child.endsWith(suffix))
    ) {
      files.push(child);
    } else if (!entry.isFile()) {
      fail(`special release input is forbidden: ${child}`);
    }
  }
  return files;
}

async function loadInputs(root, inputsPath) {
  const relative = safeRelative(inputsPath, "release inputs path");
  const bytes = await readRegularFile(root, relative);
  const document = JSON.parse(bytes.toString("utf-8"));
  exactKeys(
    document,
    ["schema", "excludeSuffixes", "groups"],
    "release inputs"
  );
  if (document.schema !== "lenso.console-service-release-inputs.v1") {
    fail("unsupported release inputs schema");
  }
  if (
    !Array.isArray(document.excludeSuffixes) ||
    document.excludeSuffixes.some(
      (suffix) => typeof suffix !== "string" || !suffix.startsWith(".")
    )
  ) {
    fail("invalid release input exclusions");
  }
  exactKeys(document.groups, groupNames, "release input groups");
  const result = {};
  for (const name of groupNames) {
    const selectors = document.groups[name];
    if (!Array.isArray(selectors) || selectors.length === 0) {
      fail(`${name} release inputs are empty`);
    }
    const expanded = await Promise.all(
      selectors.map((selector) =>
        expandSource(root, selector, document.excludeSuffixes)
      )
    );
    const files = expanded.flat().toSorted();
    if (files.length === 0 || new Set(files).size !== files.length) {
      fail(`${name} release inputs are empty or duplicate`);
    }
    const entries = await Promise.all(
      files.map(async (file) => {
        const fileBytes = await readRegularFile(root, file);
        return { path: file, sha256: sha256(fileBytes) };
      })
    );
    result[name] = sha256(Buffer.from(JSON.stringify(entries)));
  }
  return result;
}

function validateDigestList(value, label) {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => typeof item !== "string" || !digestPattern.test(item)
    ) ||
    new Set(value).size !== value.length
  ) {
    fail(`${label} must contain unique canonical SHA-256 digests`);
  }
  return [...value];
}

function validateNameList(value, label) {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => typeof item !== "string" || item.trim().length === 0
    ) ||
    new Set(value).size !== value.length
  ) {
    fail(`${label} must contain unique non-empty names`);
  }
  return [...value];
}

async function loadPolicy(root, policyPath) {
  const relative = safeRelative(policyPath, "release policy path");
  const bytes = await readRegularFile(root, relative);
  const policy = JSON.parse(bytes.toString("utf-8"));
  exactKeys(
    policy,
    ["schema", "compatibleFromSchemaDigests", "irreversibleMigrations"],
    "release policy"
  );
  if (policy.schema !== "lenso.console-service-release-policy.v1") {
    fail("unsupported release policy schema");
  }
  return {
    compatibleFromSchemaDigests: validateDigestList(
      policy.compatibleFromSchemaDigests,
      "compatibleFromSchemaDigests"
    ),
    irreversibleMigrations: validateNameList(
      policy.irreversibleMigrations,
      "irreversibleMigrations"
    ),
  };
}

function image(reference) {
  if (typeof reference !== "string") {
    fail("image reference is required");
  }
  const separator = reference.lastIndexOf("@");
  const name = reference.slice(0, separator);
  const digest = reference.slice(separator + 1);
  if (!name || separator < 1 || !digestPattern.test(digest)) {
    fail("image reference must pin a canonical SHA-256 digest");
  }
  return { digest, reference };
}

export async function buildReleaseManifest(options) {
  const root = path.resolve(options.root);
  if (!versionPattern.test(options.version)) {
    fail("version must be canonical SemVer without a prefix or prerelease");
  }
  if (!commitPattern.test(options.sourceCommit)) {
    fail("source commit must be a full lowercase Git commit");
  }
  const [digests, policy] = await Promise.all([
    loadInputs(root, options.inputsPath ?? "service/release-inputs.json"),
    loadPolicy(root, options.policyPath ?? "service/release-policy.json"),
  ]);
  return {
    compatibleFromSchemaDigests: policy.compatibleFromSchemaDigests,
    compositionDigest: digests.composition,
    configurationDigest: digests.configuration,
    contractDigest: digests.contract,
    image: image(options.imageReference),
    irreversibleMigrations: policy.irreversibleMigrations,
    releaseId: `lenso-console@${options.version}`,
    schema: "lenso.console-service-release.v1",
    schemaDigest: digests.schema,
    sourceCommit: options.sourceCommit,
    version: options.version,
  };
}

async function atomicWrite(target, bytes) {
  const destination = path.resolve(target);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.tmp`
  );
  let handle;
  try {
    handle = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o644
    );
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
  } finally {
    if (handle) {
      await handle.close();
    }
    await rm(temporary, { force: true });
  }
}

export async function writeReleaseManifest(options) {
  const manifest = await buildReleaseManifest(options);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (options.output) {
    await atomicWrite(options.output, bytes);
  } else {
    process.stdout.write(bytes);
  }
  return { digest: sha256(bytes), manifest };
}

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      fail("arguments must be --name value pairs");
    }
    const name = flag.slice(2);
    if (values[name] !== undefined) {
      fail(`duplicate --${name}`);
    }
    values[name] = value;
  }
  const allowed = new Set([
    "root",
    "version",
    "source-commit",
    "image",
    "inputs",
    "policy",
    "output",
  ]);
  for (const name of Object.keys(values)) {
    if (!allowed.has(name)) {
      fail(`unknown --${name}`);
    }
  }
  for (const name of ["version", "source-commit", "image"]) {
    if (!values[name]) {
      fail(`--${name} is required`);
    }
  }
  return {
    imageReference: values.image,
    inputsPath: values.inputs,
    output: values.output,
    policyPath: values.policy,
    root: values.root ?? process.cwd(),
    sourceCommit: values["source-commit"],
    version: values.version,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await writeReleaseManifest(
    parseArguments(process.argv.slice(2))
  );
  if (result && process.argv.includes("--output")) {
    process.stderr.write(`Console Release Manifest ${result.digest}\n`);
  }
}
