/* eslint-disable func-style -- named release phases keep failures attributable */
import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { inspectOciReleaseArtifact } from "../.lenso-release/runtime/lib/repository/oci-release-artifact.js";
import { writeReleaseManifest } from "./console-service-release.mjs";

const execFile = promisify(execFileCallback);
const commitPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const componentId = "oci:lenso-console-service";
const registryRepository = "liorael/lenso-console";

function fail(message) {
  throw new Error(`Console Service release artifacts: ${message}`);
}

export function parseReleaseSelection(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "Console Service release artifacts: invalid package selection JSON",
      {
        cause: error,
      }
    );
  }
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !value[0] ||
    typeof value[0] !== "object" ||
    Array.isArray(value[0]) ||
    Object.keys(value[0]).toSorted().join(",") !== "id,version" ||
    value[0].id !== componentId ||
    !versionPattern.test(value[0].version)
  ) {
    fail(
      `selection must contain exactly ${componentId} at a canonical version`
    );
  }
  return value[0];
}

async function assertRegularFile(filePath) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`builder output is not a regular file: ${path.basename(filePath)}`);
  }
}

export async function buildReleaseArtifacts(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const releaseCommit = options.releaseCommit ?? process.env.RELEASE_COMMIT;
  const selection = parseReleaseSelection(
    options.packagesJson ?? process.env.RELEASE_PACKAGES_JSON ?? ""
  );
  const execute = options.execute ?? execFile;
  if (!releaseCommit || !commitPattern.test(releaseCommit)) {
    fail("RELEASE_COMMIT must be a full lowercase Git commit");
  }
  const [{ stdout: head }, packageManifest] = await Promise.all([
    execute("git", ["rev-parse", "HEAD"], { cwd: root }),
    readFile(path.join(root, "package.json"), "utf-8").then(JSON.parse),
  ]);
  if (head.trim() !== releaseCommit) {
    fail("RELEASE_COMMIT does not match the checked-out source");
  }
  if (
    packageManifest.name !== "@lenso/console" ||
    packageManifest.version !== selection.version
  ) {
    fail("selected version does not match the Console workspace manifest");
  }

  const artifactDirectory = path.join(root, ".artifacts");
  const nonce = randomUUID();
  const archive = path.join(artifactDirectory, "lenso-console-service.oci.tar");
  const installManifest = path.join(
    artifactDirectory,
    "lenso-console-release.json"
  );
  const temporaryArchive = path.join(
    artifactDirectory,
    `.console-${nonce}.oci.tar`
  );
  const temporaryManifest = path.join(
    artifactDirectory,
    `.console-${nonce}.json`
  );
  const metadataPath = path.join(
    artifactDirectory,
    `.console-${nonce}.metadata.json`
  );
  await mkdir(artifactDirectory, { recursive: true });
  try {
    await execute(
      "docker",
      [
        "buildx",
        "build",
        "--file",
        "Dockerfile",
        "--platform",
        "linux/amd64",
        "--provenance=false",
        "--sbom=false",
        "--build-arg",
        `RELEASE_VERSION=${selection.version}`,
        "--build-arg",
        `RELEASE_COMMIT=${releaseCommit}`,
        "--metadata-file",
        metadataPath,
        "--output",
        `type=oci,dest=${temporaryArchive}`,
        ".",
      ],
      { cwd: root }
    );
    await assertRegularFile(temporaryArchive);
    await assertRegularFile(metadataPath);
    const metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
    const imageDigest = metadata["containerimage.digest"];
    if (!digestPattern.test(imageDigest)) {
      fail("Docker metadata does not contain a canonical image digest");
    }
    await writeReleaseManifest({
      imageReference: `ghcr.io/${registryRepository}@${imageDigest}`,
      output: temporaryManifest,
      root,
      sourceCommit: releaseCommit,
      version: selection.version,
    });
    await assertRegularFile(temporaryManifest);
    const inspected = inspectOciReleaseArtifact({
      archiveBytes: await readFile(temporaryArchive),
      installManifestBytes: await readFile(temporaryManifest),
      registryRepository,
      sourceCommit: releaseCommit,
      version: selection.version,
    });
    if (inspected.manifestDigest !== imageDigest) {
      fail("Docker metadata digest contradicts the OCI image graph");
    }
    await rename(temporaryArchive, archive);
    await rename(temporaryManifest, installManifest);
    return { archive, imageDigest, installManifest };
  } finally {
    await Promise.all([
      rm(temporaryArchive, { force: true }),
      rm(temporaryManifest, { force: true }),
      rm(metadataPath, { force: true }),
    ]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await buildReleaseArtifacts();
  process.stderr.write(
    `Console OCI archive ${result.imageDigest} and install manifest created\n`
  );
}
