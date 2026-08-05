/* eslint-disable func-style -- named release phases keep failures attributable */
import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { writeReleaseManifest } from "./console-service-release.mjs";
import { inspectOciReleaseArtifact } from "./oci-release-artifact.mjs";

const execFile = promisify(execFileCallback);
const commitPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const registryRepository = "liorael/lenso-console";

function fail(message) {
  throw new Error(`Console Service release artifacts: ${message}`);
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
  const packageManifest = await readFile(
    path.join(root, "package.json"),
    "utf-8"
  ).then(JSON.parse);
  const version =
    options.version ?? process.env.RELEASE_VERSION ?? packageManifest.version;
  const execute = options.execute ?? execFile;
  if (!releaseCommit || !commitPattern.test(releaseCommit)) {
    fail("RELEASE_COMMIT must be a full lowercase Git commit");
  }
  if (!versionPattern.test(version)) {
    fail("release version must be canonical SemVer");
  }
  const { stdout: head } = await execute("git", ["rev-parse", "HEAD"], {
    cwd: root,
  });
  if (head.trim() !== releaseCommit) {
    fail("RELEASE_COMMIT does not match the checked-out source");
  }
  if (
    packageManifest.name !== "@lenso/console-web" ||
    packageManifest.version !== version
  ) {
    fail("release version does not match the Console workspace manifest");
  }

  const artifactDirectory = path.join(root, ".artifacts");
  const buildId = randomUUID();
  const builderName = `lenso-console-${buildId}`;
  const archive = path.join(artifactDirectory, "lenso-console-service.oci.tar");
  const installManifest = path.join(
    artifactDirectory,
    "lenso-console-release.json"
  );
  const temporaryArchive = path.join(
    artifactDirectory,
    `.console-${buildId}.oci.tar`
  );
  const temporaryManifest = path.join(
    artifactDirectory,
    `.console-${buildId}.json`
  );
  const metadataPath = path.join(
    artifactDirectory,
    `.console-${buildId}.metadata.json`
  );
  await mkdir(artifactDirectory, { recursive: true });
  let builderCreated = false;
  try {
    await execute(
      "docker",
      [
        "buildx",
        "create",
        "--driver",
        "docker-container",
        "--name",
        builderName,
      ],
      { cwd: root }
    );
    builderCreated = true;
    await execute(
      "docker",
      [
        "buildx",
        "build",
        "--builder",
        builderName,
        "--file",
        "Dockerfile",
        "--platform",
        "linux/amd64",
        "--provenance=false",
        "--sbom=false",
        "--build-arg",
        `RELEASE_VERSION=${version}`,
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
      version,
    });
    await assertRegularFile(temporaryManifest);
    const inspected = inspectOciReleaseArtifact({
      archiveBytes: await readFile(temporaryArchive),
      installManifestBytes: await readFile(temporaryManifest),
      registryRepository,
      sourceCommit: releaseCommit,
      version,
    });
    if (inspected.manifestDigest !== imageDigest) {
      fail("Docker metadata digest contradicts the OCI image graph");
    }
    await rename(temporaryArchive, archive);
    await rename(temporaryManifest, installManifest);
    return { archive, imageDigest, installManifest };
  } finally {
    if (builderCreated) {
      await execute("docker", ["buildx", "rm", builderName], {
        cwd: root,
      }).catch((error) => {
        process.stderr.write(
          `Unable to remove temporary Buildx builder ${builderName}: ${error.message}\n`
        );
      });
    }
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
    result
      ? `Console OCI archive ${result.imageDigest} and install manifest created\n`
      : "No Console OCI artifact was built\n"
  );
}
