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
  "service/README.md",
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

  test("proves only exact failures that precede preflight and registry access", async () => {
    const proof = await source(
      ".github/workflows/verify-production-prepublish-failure.yml"
    );

    expect(proof).toContain(
      'Build composite release artifacts when configured" and .conclusion == "failure"'
    );
    expect(proof).toContain(
      'Complete fail-closed preflight before any registry OIDC" and .conclusion == "skipped"'
    );
    expect(proof).toContain(
      'Atomically consume proof and seal exact registry artifacts" and .conclusion == "skipped"'
    );
    expect(proof).toContain(
      'Publish and confirm receipts" and .conclusion == "skipped"'
    );
  });

  test("proves exact zero-write failures after proof consumption", async () => {
    const proof = await source(
      ".github/workflows/verify-production-zero-write-failure.yml"
    );

    expect(proof).toContain(
      'Complete fail-closed preflight before any registry OIDC" and .conclusion == "success"'
    );
    expect(proof).toContain(
      'Atomically consume proof and seal exact registry artifacts" and .conclusion == "success"'
    );
    expect(proof).toContain("npm error code ENEEDAUTH");
    expect(proof).toContain(
      "https://registry.npmjs.org/%40lenso%2Fconsole-package-api/0.1.2"
    );
    expect(proof).toContain(
      "https://ghcr.io/v2/liorael/lenso-console/manifests/0.1.4"
    );
  });

  test("uses the reviewed publication recovery for npm and OCI", async () => {
    const publisher = await source(".github/workflows/publish.yml");
    const standaloneRecovery = await source(
      ".github/workflows/recover-partial-production.yml"
    );
    const runtime = await source(
      ".lenso-release/runtime/lib/repository/runtime.js"
    );

    expect(publisher).toContain("packages: write");
    expect(publisher).toMatch(/LENSO_OCI_TOKEN: \$\{\{ github\.token \}\}/u);
    for (const recovery of [publisher, standaloneRecovery]) {
      expect(recovery).toContain("working-directory: recovery-candidate");
      expect(recovery).toContain("pnpm run --if-present release:artifacts");
      expect(recovery).toMatch(
        /RELEASE_COMMIT: \$\{\{ inputs\.release_commit \}\}/u
      );
      expect(recovery).toMatch(
        /RELEASE_PACKAGES_JSON: \$\{\{ inputs\.packages_json \}\}/u
      );
    }
    expect(runtime).toContain('"production-zero-write"');
    expect(runtime).toContain(
      "publication recovery supports Cargo, npm, and OCI packages only"
    );
    expect(runtime).toContain("ociObservation(name, item.version, artifact");
  });

  test("builds the public Shell UI before release artifacts are packed", async () => {
    const manifest = JSON.parse(await source("package.json"));
    const build = manifest.scripts["build:local"];
    const packageBuild = "pnpm --filter @lenso/console-ui build";

    expect(build).toContain(packageBuild);
    expect(build.indexOf(packageBuild)).toBeLessThan(build.indexOf("tsc -b"));
  });

  test("publishes the public Module API and UI packages", async () => {
    const components = await source(".lenso-release/runtime/components.yaml");

    expect(components).toContain("id: npm:@lenso/console-module-api");
    expect(components).toContain("id: npm:@lenso/console-ui");
    expect(components).not.toContain("npm:@lenso/console-bridge");
  });

  test("does not retain retired service SDK packages", async () => {
    await expect(
      access(path.join(root, "packages/remote-module-kit"))
    ).rejects.toThrow();
    await expect(
      access(path.join(root, "packages/service-kit"))
    ).rejects.toThrow();
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

  test("owns the Runtime Story backend beside its linked Console Module", async () => {
    const storyManifest = await source("service/modules/story/Cargo.toml");
    const storyModule = await source("service/modules/story/src/module.rs");
    const serviceManifest = await source("service/Cargo.toml");

    expect(storyManifest).toContain('name = "lenso-module-story"');
    expect(storyManifest).toContain("publish = false");
    expect(storyManifest).toContain(
      'repository = "https://github.com/LioRael/lenso-console"'
    );
    expect(storyModule).toContain('"component": "lenso/runtime-stories"');
    expect(storyModule).toContain("ConsoleSurfacePresentation::Declarative");
    expect(serviceManifest).toContain('path = "modules/story"');
  });
});
