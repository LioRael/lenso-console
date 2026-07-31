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
    expect(
      publisher.match(
        /docker\/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f/gu
      )
    ).toHaveLength(1);
  });

  test("builds the public package API before release artifacts are packed", async () => {
    const manifest = JSON.parse(await source("package.json"));
    const build = manifest.scripts["build:local"];
    const packageBuild = "pnpm --filter @lenso/console-package-api build";

    expect(build).toContain(packageBuild);
    expect(build.indexOf(packageBuild)).toBeLessThan(build.indexOf("tsc -b"));
  });

  test("does not retain the retired remote module package", async () => {
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
});
