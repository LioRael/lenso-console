import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const currentRepository = "LioRael/lenso-console";
const legacyRepository = "LioRael/lenso-runtime-console";

const source = (file) => readFile(path.join(root, file), "utf-8");
const missing = (file) =>
  expect(access(path.join(root, file))).rejects.toMatchObject({
    code: "ENOENT",
  });

const sourceFiles = async (directory) => {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "dist" && entry.name !== "node_modules") {
        files.push(...(await sourceFiles(relativePath)));
      }
      continue;
    }

    if (/\.(?:css|js|jsx|mjs|ts|tsx)$/u.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
};

const borderWidthsWithoutStyles = (file, contents) => {
  const lines = contents.split("\n");
  const failures = [];

  for (const [index, line] of lines.entries()) {
    const match = line.match(
      /^(\s*)(border(?:Block|Inline|Top|Bottom|Left|Right)?Width):\s*(.+),$/u
    );
    if (!match || /:\s*(?:0|["']0(?:px)?["'])\s*,?$/u.test(line)) {
      continue;
    }

    const indentation = match[1].length;
    let start = index;
    while (
      start > 0 &&
      (lines[start].match(/^\s*/u)?.[0].length ?? 0) >= indentation
    ) {
      start -= 1;
    }
    let end = index + 1;
    while (
      end < lines.length &&
      (lines[end].match(/^\s*/u)?.[0].length ?? 0) >= indentation
    ) {
      end += 1;
    }

    const matchingStyle = match[2].replace("Width", "Style");
    if (!lines.slice(start, end).join("\n").includes(`${matchingStyle}:`)) {
      failures.push(`${file}:${index + 1} (${matchingStyle})`);
    }
  }

  return failures;
};

describe("Lenso Console repository boundary", () => {
  test.each([
    "Dockerfile",
    "README.md",
    "docs/agents/issue-tracker.md",
    "docs/release-process.md",
    "docs/repository-operations.md",
    "service/README.md",
  ])("%s uses the renamed repository identity", async (file) => {
    const contents = await source(file);

    expect(contents).toContain(currentRepository);
    expect(contents).not.toContain(legacyRepository);
  });

  test("does not retain the retired central release machinery", async () => {
    for (const file of [
      ".lenso-release",
      ".tegami",
      ".github/workflows/publish.yml",
      ".github/workflows/recover-partial-production.yml",
      ".github/workflows/release-plan.yml",
      ".github/workflows/verify-production-oci-absence.yml",
      ".github/workflows/verify-production-prepublish-failure.yml",
      ".github/workflows/verify-production-zero-write-failure.yml",
      "scripts/publish-cargo.sh",
      "scripts/publish-node.mjs",
      "scripts/release-mode.mjs",
      "scripts/release-plan.mjs",
      "tegami.config.mjs",
    ]) {
      await missing(file);
    }

    const trackedReleaseSources = await Promise.all([
      source("AGENTS.md"),
      source("package.json"),
      source(".github/workflows/release-changesets.yml"),
      source(".github/workflows/release-oci.yml"),
      source("scripts/build-console-release-artifacts.mjs"),
      source("scripts/oci-release-artifact.mjs"),
    ]);
    for (const contents of trackedReleaseSources) {
      expect(contents).not.toContain("lenso-release");
      expect(contents).not.toContain("tegami");
    }
  });

  test("uses Changesets for the public npm workspace", async () => {
    const manifest = JSON.parse(await source("package.json"));
    const config = JSON.parse(await source(".changeset/config.json"));
    const workflow = await source(".github/workflows/release-changesets.yml");
    const publicPackagePaths = [
      "packages/console-composition-api/package.json",
      "packages/console-module-api/package.json",
      "packages/console-tokens/package.json",
      "packages/console-ui/package.json",
    ];
    const publicPackages = await Promise.all(
      publicPackagePaths.map(async (packagePath) => ({
        directory: path.dirname(packagePath),
        manifest: JSON.parse(await source(packagePath)),
      }))
    );

    expect(manifest.private).toBe(true);
    expect(manifest.scripts.changeset).toBe("changeset");
    expect(manifest.scripts.version).toBe("changeset version");
    expect(manifest.scripts.release).toContain("changeset publish");
    expect(manifest.devDependencies["@changesets/cli"]).toBe("2.31.1");
    expect(config.privatePackages).toEqual({ tag: false, version: true });
    expect(workflow).toContain("changesets/action@");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("NPM_CONFIG_PROVENANCE");
    expect(workflow).not.toContain("NPM_TOKEN");
    for (const { directory, manifest: packageManifest } of publicPackages) {
      expect(manifest.scripts.release).toContain(
        `pnpm --filter ${packageManifest.name} build`
      );
      expect(packageManifest.publishConfig).toEqual({ access: "public" });
      expect(packageManifest.repository).toEqual({
        directory,
        type: "git",
        url: "https://github.com/LioRael/lenso-console",
      });
    }
  });

  test("owns OCI publication in the Console repository", async () => {
    const workflow = await source(".github/workflows/release-oci.yml");
    const builder = await source("scripts/build-console-release-artifacts.mjs");
    const inspector = await source("scripts/oci-release-artifact.mjs");

    expect(workflow).toContain("ghcr.io/liorael/lenso-console");
    expect(workflow).toContain("docker/build-push-action@");
    expect(workflow).toContain("actions/attest-build-provenance@");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("Refuse an existing immutable version tag");
    expect(workflow).not.toContain("LENSO_COORDINATOR");
    expect(workflow).not.toContain("NONCE");
    expect(builder).toContain('from "./oci-release-artifact.mjs"');
    expect(builder).not.toContain(".lenso-release");
    expect(inspector).toContain("inspectOciInstallManifest");
  });

  test("builds the public Shell UI before the application bundle", async () => {
    const manifest = JSON.parse(await source("package.json"));
    const build = manifest.scripts["build:local"];
    const packageBuild = "pnpm --filter @lenso/console-ui build";

    expect(build).toContain(packageBuild);
    expect(build.indexOf(packageBuild)).toBeLessThan(build.indexOf("tsc -b"));
  });

  test("does not retain retired service SDK packages", async () => {
    await missing("packages/remote-module-kit");
    await missing("packages/service-kit");
  });

  test("keeps component styling local to StyleX owners", async () => {
    for (const file of [
      "packages/console-ui/components.css",
      "packages/console-ui/src/styles.ts",
      "packages/console-ui/src/stylex-utilities.ts",
      "src/lib/cn.ts",
    ]) {
      await missing(file);
    }

    const files = [
      ...(await sourceFiles("src")),
      ...(await sourceFiles("packages")),
    ];
    const contents = await Promise.all(files.map((file) => source(file)));
    const joined = contents.join("\n");

    expect(joined).not.toContain("mergeStyleProps");
    expect(joined).not.toContain("legacyClassNameProps");
    expect(joined).not.toContain("stylexClassName");
    expect(joined).not.toContain("utilityProps(");
    expect(joined).not.toMatch(
      /(?:from\s*|import\s*(?:\(\s*)?)["'][^"']+\.(?:js|ts)["']/u
    );
  });

  test("keeps authored borders independent from the browser reset", async () => {
    const sourceFileList = [
      ...(await sourceFiles("src")),
      ...(await sourceFiles("packages")),
    ];
    const files = sourceFileList.filter((file) => /\.(?:ts|tsx)$/u.test(file));
    const failureGroups = await Promise.all(
      files.map(async (file) =>
        borderWidthsWithoutStyles(file, await source(file))
      )
    );
    const failures = failureGroups.flat();

    expect(failures).toEqual([]);
  });

  test("keeps the Delivery divider inside the page gutter", async () => {
    const styles = await source("src/styles.css");
    const deliveryHeaderRule = styles.match(
      /\[data-page~="delivery-page"\] \[data-ui~="page__header"\] \{([^}]*)\}/u
    )?.[1];
    const deliveryWorkspaceRule = styles.match(
      /\[data-page-slot~="delivery-page__workspace"\] \{([^}]*)\}/u
    )?.[1];

    expect(deliveryHeaderRule ?? "").not.toMatch(
      /\b(?:box-shadow|border-(?:bottom|block-end))\s*:/u
    );
    expect(deliveryWorkspaceRule ?? "").toContain(
      "border-top: 1px solid var(--line-subtle)"
    );
  });

  test("documents the local release boundary", async () => {
    const contents = await source("docs/repository-operations.md");

    expect(contents).toContain(currentRepository);
    expect(contents).not.toContain(legacyRepository);
    expect(contents).toContain("Changesets");
    expect(contents).toContain("GHCR");
    expect(contents).not.toContain("shadow release");
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
    expect(serviceManifest).toContain("publish = false");
  });
});
