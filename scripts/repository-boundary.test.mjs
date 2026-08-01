import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const currentRepository = "LioRael/lenso-console";
const legacyRepository = "LioRael/lenso-runtime-console";

const liveRepositoryIdentityFiles = [
  ".lenso-release/config.json",
  ".lenso-release/runtime/components.yaml",
  ".lenso-release/runtime/lib/config/components.js",
  ".lenso-release/runtime/lib/registry/oci.js",
  "Dockerfile",
  "README.md",
  "docs/agents/issue-tracker.md",
  "packages/console-package-api/package.json",
  "packages/remote-module-kit/README.md",
  "packages/remote-module-kit/package.json",
  "packages/service-kit/package.json",
  "service/README.md",
];

const repositoryIndependentScripts = [
  "scripts/console-api-fixture.sh",
  "scripts/console-api-qa.sh",
];

const source = (file) => readFile(path.join(root, file), "utf-8");

describe("Lenso Console repository boundary", () => {
  test.each(liveRepositoryIdentityFiles)(
    "%s uses the renamed repository identity",
    async (file) => {
      const contents = await source(file);

      expect(contents).toContain(currentRepository);
      expect(contents).not.toContain(legacyRepository);
    }
  );

  test.each(repositoryIndependentScripts)(
    "%s does not assume a checkout directory name",
    async (file) => {
      const contents = await source(file);

      expect(contents).not.toContain("lenso-runtime-console");
      expect(contents).not.toContain("cd ../lenso-console");
    }
  );

  test("uses only the coordinator-authorized publisher", async () => {
    await expect(
      access(path.join(root, ".github/workflows/publish-remote-module-kit.yml"))
    ).rejects.toThrow();

    const publisher = await source(".github/workflows/publish.yml");
    expect(publisher).toContain("workflow_dispatch:");
    expect(publisher).toContain("LENSO_COORDINATOR_PREFLIGHT_URL");
    expect(publisher).toContain("LENSO_COORDINATOR_RECEIPT_URL");
    expect(publisher).toContain("LENSO_OCI_TOKEN");
    expect(publisher).toContain(
      "node .lenso-release/runtime/lib/repository/cli.js publish"
    );
    expect(publisher).not.toContain("docker/setup-buildx-action");
  });

  test("accepts every release mode enabled by reviewed repository config", async () => {
    const config = JSON.parse(await source(".lenso-release/shadow.json"));

    for (const mode of config.allowedModes) {
      const output = execFileSync(
        process.execPath,
        ["scripts/release-mode.mjs"],
        {
          cwd: root,
          encoding: "utf-8",
          env: {
            ...process.env,
            LENSO_SHADOW_ATTESTATION_URL: "https://shadow.example/attestations",
            LENSO_SHADOW_CRATES_API_URL: "https://shadow.example/cargo",
            LENSO_SHADOW_CRATES_UPLOAD_URL:
              "https://shadow.example/cargo/upload",
            LENSO_SHADOW_GITHUB_API_URL: "https://shadow.example/github",
            LENSO_SHADOW_NPM_REGISTRY_URL: "https://shadow.example/npm",
            LENSO_SHADOW_OCI_REGISTRY_URL: "https://shadow.example/oci",
            REQUESTED_MODE: mode,
          },
        }
      );
      expect(output).toContain(`LENSO_RELEASE_MODE=${mode}`);
    }
  });

  test("builds the public package API before release artifacts are packed", async () => {
    const manifest = JSON.parse(await source("package.json"));
    const build = manifest.scripts["build:local"];
    const packageBuild = "pnpm --filter @lenso/console-package-api build";

    expect(build).toContain(packageBuild);
    expect(build.indexOf(packageBuild)).toBeLessThan(build.indexOf("tsc -b"));
  });

  test("documents the live identity and cross-repository responsibilities", async () => {
    const contents = await source("docs/repository-operations.md");

    expect(contents).toContain(currentRepository);
    expect(contents).not.toContain(legacyRepository);
    expect(contents).toContain("Console Service API");
    expect(contents).toContain("System Registry Module");
    expect(contents).toContain(
      "managed-Service System Plane Capability Providers"
    );
    expect(contents).toMatch(/must\s+not depend on this repository/u);
  });

  test("owns the Runtime Story backend beside its Console package", async () => {
    const storyManifest = await source("service/modules/story/Cargo.toml");
    const storyModule = await source("service/modules/story/src/module.rs");
    const serviceManifest = await source("service/Cargo.toml");

    expect(storyManifest).toContain('name = "lenso-module-story"');
    expect(storyManifest).toContain("publish = false");
    expect(storyManifest).toContain(
      'repository = "https://github.com/LioRael/lenso-console"'
    );
    expect(storyModule).toContain('"@lenso/story-console"');
    expect(serviceManifest).toContain('path = "modules/story"');
  });
});
