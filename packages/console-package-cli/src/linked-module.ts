import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildConsolePackageContext,
  createConsolePackage,
} from "./console-package";
import {
  findRepoRoot,
  insertBeforeFirstNeedle,
  insertIntoLinkedModuleEntries,
  pathExists,
  queueWrite,
  repoPaths,
  rustConsoleArea,
  slugify,
  snakeCase,
  writePendingFiles,
} from "./file-utils";
import { createRemoteModule } from "./remote-module";
import type {
  CliOptions,
  ConsolePackageContext,
  ModuleContext,
  PendingWrites,
} from "./types";

const moduleCargoToml = ({ moduleId }: { moduleId: string }) => `[package]
name = "${moduleId}"
version = "0.1.0"
edition.workspace = true
license.workspace = true
publish.workspace = true
rust-version.workspace = true

[dependencies]
platform-core.workspace = true
platform-module.workspace = true

[lints]
workspace = true
`;

const moduleLib = () => `pub mod module;
`;

const moduleManifestImports = (consoleSurface?: ConsolePackageContext) =>
  consoleSurface
    ? "use platform_module::{ConsoleArea, ConsolePackage, ConsoleSurface, LinkedBinding, Module, ModuleManifest};"
    : "use platform_module::{LinkedBinding, Module, ModuleManifest};";

const moduleManifestBuilder = ({
  consoleSurface,
  moduleId,
}: {
  consoleSurface: ConsolePackageContext | undefined;
  moduleId: string;
}) => {
  if (!consoleSurface) {
    return `ModuleManifest::builder("${moduleId}").build()`;
  }
  return `ModuleManifest::builder("${moduleId}")
        .capabilities(vec!["${consoleSurface.capability}".to_owned()])
        .console(vec![ConsoleSurface {
            name: "${consoleSurface.surfaceName}".to_owned(),
            label: "${consoleSurface.label}".to_owned(),
            area: ConsoleArea::${rustConsoleArea(consoleSurface.area)},
            route: "${consoleSurface.route}".to_owned(),
            package: ConsolePackage {
                name: "${consoleSurface.packageName}".to_owned(),
                export: "${consoleSurface.moduleName}".to_owned(),
            },
            icon: Some("${consoleSurface.icon}".to_owned()),
            required_capabilities: vec!["${consoleSurface.capability}".to_owned()],
            navigation: Some(platform_module::ConsoleNavigation {
                workspace: platform_module::ConsoleWorkspaceRef {
                    id: "${moduleId}".to_owned(),
                    label: "${consoleSurface.label}".to_owned(),
                    icon: Some("${consoleSurface.icon}".to_owned()),
                },
                group: None,
                order: Some(10),
            }),
        }])
        .build()`;
};

const moduleManifest = ({
  consoleSurface,
  moduleId,
}: {
  consoleSurface: ConsolePackageContext | undefined;
  moduleId: string;
}) => `use platform_core::AppContext;
${moduleManifestImports(consoleSurface)}

/// Context-free manifest: serializable metadata only.
pub fn manifest() -> ModuleManifest {
    ${moduleManifestBuilder({ consoleSurface, moduleId })}
}

/// The loaded module: manifest + linked behavior.
pub fn module(_ctx: &AppContext) -> Module {
    Module::linked(manifest(), LinkedBinding::builder().build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_uses_module_name() {
        assert_eq!(manifest().name, "${moduleId}");
    }
}
`;

const updateWorkspaceCargoToml = async ({
  moduleCrate,
  moduleId,
  paths,
  pendingWrites,
}: ModuleContext) => {
  let fileSource = await readFile(paths.cargoTomlPath, "utf-8");
  fileSource = insertBeforeFirstNeedle(
    fileSource,
    `    "modules/${moduleId}",\n`,
    ['    "tools/', "]\n\n[workspace.package]"]
  );
  fileSource = insertBeforeFirstNeedle(
    fileSource,
    `${moduleCrate} = { path = "modules/${moduleId}" }\n`,
    ["generate-contracts =", "arch-check =", "remote-module-example ="]
  );
  queueWrite(pendingWrites, paths.cargoTomlPath, fileSource);
};

const updateAppBootstrapCargoToml = async ({
  moduleCrate,
  paths,
  pendingWrites,
}: ModuleContext) => {
  const fileSource = await readFile(paths.appBootstrapCargoTomlPath, "utf-8");
  queueWrite(
    pendingWrites,
    paths.appBootstrapCargoTomlPath,
    insertBeforeFirstNeedle(fileSource, `${moduleCrate}.workspace = true\n`, [
      "serde_json.workspace",
      "tracing.workspace",
      "\n[dev-dependencies]",
    ])
  );
};

const updateAppBootstrapLib = async ({
  moduleCrate,
  moduleId,
  paths,
  pendingWrites,
}: ModuleContext) => {
  const fileSource = await readFile(paths.appBootstrapLibPath, "utf-8");
  const entry = `    LinkedModuleEntry {
        module_name: "${moduleId}",
        manifest: ${moduleCrate}::module::manifest,
        load: ${moduleCrate}::module::module,
        http_binding: None,
    },
`;
  queueWrite(
    pendingWrites,
    paths.appBootstrapLibPath,
    insertIntoLinkedModuleEntries(fileSource, entry)
  );
};

const queueModuleFiles = ({
  consoleSurface,
  moduleDir,
  moduleId,
  pendingWrites,
}: ModuleContext) => {
  queueWrite(
    pendingWrites,
    path.join(moduleDir, "Cargo.toml"),
    moduleCargoToml({ moduleId })
  );
  queueWrite(pendingWrites, path.join(moduleDir, "src/lib.rs"), moduleLib());
  queueWrite(
    pendingWrites,
    path.join(moduleDir, "src/module.rs"),
    moduleManifest({ consoleSurface, moduleId })
  );
};

export const createModule = async ({ options }: { options: CliOptions }) => {
  if (options.remote) {
    await createRemoteModule({ options });
    return;
  }

  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : await findRepoRoot(process.cwd());
  const moduleId = slugify(options.moduleId ?? "");
  if (!moduleId) {
    throw new Error("Module id is required");
  }
  const moduleCrate = snakeCase(moduleId);
  const moduleDir = path.join(repoRoot, "modules", moduleId);
  const consoleRuntimeRoot = path.resolve(
    options.runtimeConsoleRoot ?? path.join(repoRoot, "apps/runtime-console")
  );
  const consoleSurface = options.withConsole
    ? buildConsolePackageContext({
        options: { ...options, moduleId },
        runtimeConsoleRoot: consoleRuntimeRoot,
      })
    : undefined;

  if (await pathExists(moduleDir)) {
    throw new Error(`Module directory already exists: modules/${moduleId}`);
  }

  const paths = repoPaths(repoRoot);
  const pendingWrites: PendingWrites = new Map();
  const moduleContext: ModuleContext = {
    consoleSurface,
    moduleCrate,
    moduleDir,
    moduleId,
    paths,
    pendingWrites,
  };

  queueModuleFiles(moduleContext);
  await updateWorkspaceCargoToml(moduleContext);
  await updateAppBootstrapCargoToml(moduleContext);
  await updateAppBootstrapLib(moduleContext);

  if (options.dryRun) {
    console.log("Module dry run:");
    for (const filePath of pendingWrites.keys()) {
      console.log(`- ${path.relative(repoRoot, filePath)}`);
    }
    if (options.withConsole) {
      await createConsolePackage({
        defaultRuntimeConsoleRoot: consoleRuntimeRoot,
        options: { ...options, moduleId },
      });
    }
    return;
  }

  await writePendingFiles(pendingWrites);
  if (options.withConsole) {
    await createConsolePackage({
      defaultRuntimeConsoleRoot: consoleRuntimeRoot,
      options: { ...options, moduleId },
    });
  }

  console.log(`Created module ${moduleId}.`);
  console.log("Next steps:");
  console.log(`- cargo test --locked -p ${moduleCrate}`);
  console.log("- just rust-check");
  console.log("- just arch-check");
};
