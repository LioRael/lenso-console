import { createHash } from "node:crypto";
/* eslint-disable func-style -- named fixture builders keep release tests readable */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  buildReleaseArtifacts,
  parseReleaseSelection,
} from "./build-console-release-artifacts.mjs";
import { buildReleaseManifest } from "./console-service-release.mjs";

const root = path.resolve(import.meta.dirname, "..");
const digest = (character) => `sha256:${character.repeat(64)}`;
const sourceCommit = "b".repeat(40);
const temporaryRoots = [];

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function tar(files) {
  const entries = [];
  for (const [name, bytes] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf-8");
    header.write("0000644\0", 100, "ascii");
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    header.write(
      `${bytes.length.toString(8).padStart(11, "0")}\0`,
      124,
      "ascii"
    );
    header[156] = 48;
    header.write("ustar\0", 257, "ascii");
    entries.push(
      header,
      bytes,
      Buffer.alloc((512 - (bytes.length % 512)) % 512)
    );
  }
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

function ociArchive(version, commit) {
  const config = Buffer.from(
    JSON.stringify({
      config: {
        Labels: {
          "org.opencontainers.image.revision": commit,
          "org.opencontainers.image.version": version,
        },
      },
      created: "2026-07-30T08:00:00Z",
    })
  );
  const layer = Buffer.from("layer");
  const manifest = Buffer.from(
    JSON.stringify({
      config: {
        digest: sha256(config),
        mediaType: "application/vnd.oci.image.config.v1+json",
        size: config.length,
      },
      layers: [
        {
          digest: sha256(layer),
          mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
          size: layer.length,
        },
      ],
      schemaVersion: 2,
    })
  );
  const index = Buffer.from(
    JSON.stringify({
      manifests: [
        {
          digest: sha256(manifest),
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          size: manifest.length,
        },
      ],
      schemaVersion: 2,
    })
  );
  return {
    // eslint-disable-next-line sort-keys -- archive entry order is explicit test evidence
    bytes: tar({
      "oci-layout": Buffer.from('{"imageLayoutVersion":"1.0.0"}'),
      "index.json": index,
      [`blobs/sha256/${sha256(config).slice(7)}`]: config,
      [`blobs/sha256/${sha256(layer).slice(7)}`]: layer,
      [`blobs/sha256/${sha256(manifest).slice(7)}`]: manifest,
    }),
    digest: sha256(manifest),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

function options(overrides = {}) {
  return {
    imageReference: `ghcr.io/liorael/lenso-console@${digest("a")}`,
    root,
    sourceCommit,
    version: "0.2.0",
    ...overrides,
  };
}

async function fixture() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "lenso-console-release-test-")
  );
  temporaryRoots.push(directory);
  await mkdir(path.join(directory, "service"));
  await writeFile(path.join(directory, "service/source.txt"), "source\n");
  await writeFile(
    path.join(directory, "service/release-inputs.json"),
    JSON.stringify({
      excludeSuffixes: [".test.ts"],
      groups: {
        composition: ["service/source.txt"],
        configuration: ["service/source.txt"],
        contract: ["service/source.txt"],
        schema: ["service/source.txt"],
      },
      schema: "lenso.console-service-release-inputs.v1",
    })
  );
  await writeFile(
    path.join(directory, "service/release-policy.json"),
    JSON.stringify({
      compatibleFromSchemaDigests: [],
      irreversibleMigrations: [],
      schema: "lenso.console-service-release-policy.v1",
    })
  );
  return directory;
}

async function artifactFixture() {
  const directory = await fixture();
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "@lenso/console", version: "0.2.0" })
  );
  return directory;
}

describe("Console Service release manifest", () => {
  test("selects the reviewed composite OCI component from a mixed plan", () => {
    expect(
      parseReleaseSelection(
        JSON.stringify([{ id: "oci:lenso-console-service", version: "0.2.0" }])
      )
    ).toEqual({ id: "oci:lenso-console-service", version: "0.2.0" });
    expect(
      parseReleaseSelection(
        JSON.stringify([{ id: "oci:lenso-console-service", version: "0.2.0" }])
      )
    ).toEqual({ id: "oci:lenso-console-service", version: "0.2.0" });
    expect(() => parseReleaseSelection("[]")).toThrow(
      "selection must contain exactly one oci:lenso-console-service"
    );
    expect(() =>
      parseReleaseSelection(
        JSON.stringify([{ id: "npm:@lenso/console", version: "0.2.0" }])
      )
    ).toThrow("selection must contain exactly one oci:lenso-console-service");
    expect(() =>
      parseReleaseSelection(
        JSON.stringify([
          { id: "oci:lenso-console-service", version: "0.2.0" },
          { id: "oci:lenso-console-service", version: "0.2.0" },
        ])
      )
    ).toThrow("unique canonical package identities");
  });

  test("builds and verifies the exact OCI graph before exposing release artifacts", async () => {
    const directory = await artifactFixture();
    const archive = ociArchive("0.2.0", sourceCommit);
    const execute = async (command, arguments_) => {
      if (command === "git") {
        return { stderr: "", stdout: `${sourceCommit}\n` };
      }
      expect(command).toBe("docker");
      const metadataPath =
        arguments_[arguments_.indexOf("--metadata-file") + 1];
      const output = arguments_[arguments_.indexOf("--output") + 1];
      const archivePath = output.slice("type=oci,dest=".length);
      await writeFile(archivePath, archive.bytes);
      await writeFile(
        metadataPath,
        JSON.stringify({ "containerimage.digest": archive.digest })
      );
      return { stderr: "", stdout: "" };
    };
    const result = await buildReleaseArtifacts({
      execute,
      packagesJson: JSON.stringify([
        { id: "oci:lenso-console-service", version: "0.2.0" },
      ]),
      releaseCommit: sourceCommit,
      root: directory,
    });
    expect(result.imageDigest).toBe(archive.digest);
    await expect(readFile(result.archive)).resolves.toEqual(archive.bytes);
    await expect(readFile(result.installManifest, "utf-8")).resolves.toContain(
      `ghcr.io/liorael/lenso-console@${archive.digest}`
    );
  });

  test("keeps final artifact paths absent when the OCI graph contradicts Docker metadata", async () => {
    const directory = await artifactFixture();
    const archive = ociArchive("0.2.0", sourceCommit);
    const execute = async (command, arguments_) => {
      if (command === "git") {
        return { stderr: "", stdout: `${sourceCommit}\n` };
      }
      const metadataPath =
        arguments_[arguments_.indexOf("--metadata-file") + 1];
      const output = arguments_[arguments_.indexOf("--output") + 1];
      await writeFile(output.slice("type=oci,dest=".length), archive.bytes);
      await writeFile(
        metadataPath,
        JSON.stringify({ "containerimage.digest": digest("f") })
      );
      return { stderr: "", stdout: "" };
    };
    await expect(
      buildReleaseArtifacts({
        execute,
        packagesJson: JSON.stringify([
          { id: "oci:lenso-console-service", version: "0.2.0" },
        ]),
        releaseCommit: sourceCommit,
        root: directory,
      })
    ).rejects.toThrow("install manifest does not bind the OCI image");
    await expect(
      readFile(path.join(directory, ".artifacts/lenso-console-service.oci.tar"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(directory, ".artifacts/lenso-console-release.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("deterministically binds the OCI image and all release inputs", async () => {
    const first = await buildReleaseManifest(options());
    const second = await buildReleaseManifest(options());

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      compatibleFromSchemaDigests: [],
      image: {
        digest: digest("a"),
        reference: `ghcr.io/liorael/lenso-console@${digest("a")}`,
      },
      irreversibleMigrations: [],
      releaseId: "lenso-console@0.2.0",
      schema: "lenso.console-service-release.v1",
      sourceCommit,
      version: "0.2.0",
    });
    for (const name of [
      "compositionDigest",
      "schemaDigest",
      "contractDigest",
      "configurationDigest",
    ]) {
      expect(first[name]).toMatch(/^sha256:[a-f0-9]{64}$/u);
    }
  });

  test("rejects mutable images and ambiguous release identities", async () => {
    await expect(
      buildReleaseManifest(
        options({ imageReference: "ghcr.io/liorael/lenso-console:latest" })
      )
    ).rejects.toThrow("image reference must pin");
    await expect(
      buildReleaseManifest(options({ version: "v0.2.0" }))
    ).rejects.toThrow("version must be canonical SemVer");
    await expect(
      buildReleaseManifest(options({ sourceCommit: "ABC" }))
    ).rejects.toThrow("source commit must be a full lowercase Git commit");
  });

  test("changes every affected digest when a declared input changes", async () => {
    const directory = await fixture();
    const first = await buildReleaseManifest(options({ root: directory }));
    await writeFile(path.join(directory, "service/source.txt"), "changed\n");
    const second = await buildReleaseManifest(options({ root: directory }));

    for (const name of [
      "compositionDigest",
      "schemaDigest",
      "contractDigest",
      "configurationDigest",
    ]) {
      expect(second[name]).not.toBe(first[name]);
    }
  });

  test("fails closed when release policy contains duplicate evidence", async () => {
    const directory = await fixture();
    await writeFile(
      path.join(directory, "service/release-policy.json"),
      JSON.stringify({
        compatibleFromSchemaDigests: [digest("c"), digest("c")],
        irreversibleMigrations: [],
        schema: "lenso.console-service-release-policy.v1",
      })
    );
    await expect(
      buildReleaseManifest(options({ root: directory }))
    ).rejects.toThrow("unique canonical SHA-256 digests");
  });

  test("rejects symbolic links anywhere in the declared source inventory", async () => {
    const directory = await fixture();
    const link = path.join(directory, "service/source-link.txt");
    await symlink("source.txt", link);
    const inputs = JSON.parse(
      await readFile(
        path.join(directory, "service/release-inputs.json"),
        "utf-8"
      )
    );
    inputs.groups.composition = ["service/source-link.txt"];
    await writeFile(
      path.join(directory, "service/release-inputs.json"),
      JSON.stringify(inputs)
    );
    await expect(
      buildReleaseManifest(options({ root: directory }))
    ).rejects.toThrow("symbolic link is forbidden");
  });
});
