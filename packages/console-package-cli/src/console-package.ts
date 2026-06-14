import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  appendListItem,
  appendToken,
  consolePackageKey,
  defaultIcon,
  defaultRuntimeConsoleRootForRepo,
  exportStemFromPackageSlug,
  findRepoRoot,
  insertBeforeNeedle,
  pascalCase,
  pathExists,
  queueWrite,
  readJson,
  relativePath,
  runtimeConsolePaths,
  rustConsoleArea,
  slugify,
  sortObject,
  titleCase,
  writePendingFiles,
} from "./file-utils";
import type {
  CliOptions,
  ConsolePackageContext,
  ConsolePackageContextWithWrites,
  ConsolePackageInstallPlan,
  ConsolePackageReference,
  PackageJson,
  PendingWrites,
  RuntimeConsolePaths,
} from "./types";

const updatePackageJson = async ({
  packageName,
  packageSlug,
  paths,
  pendingWrites,
}: {
  packageName: string;
  packageSlug: string;
  paths: RuntimeConsolePaths;
  pendingWrites: PendingWrites;
}) => {
  const packageJson = (await readJson(paths.packageJsonPath)) as PackageJson;
  packageJson.dependencies = sortObject({
    ...packageJson.dependencies,
    [packageName]: "workspace:*",
  });
  packageJson.scripts ??= {};
  packageJson.scripts.test = appendToken(
    packageJson.scripts.test ?? "",
    `packages/${packageSlug}/src`,
    "packages/console-package-api/src"
  );
  queueWrite(
    pendingWrites,
    paths.packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
};

const updateRuntimeConsoleDependency = ({
  dependencyVersion,
  packageJson,
  packageName,
}: {
  dependencyVersion: string;
  packageJson: PackageJson;
  packageName: string;
}) => {
  packageJson.dependencies = sortObject({
    ...packageJson.dependencies,
    [packageName]: packageJson.dependencies?.[packageName] ?? dependencyVersion,
  });
};

const updateTsconfig = async ({
  packageSlug,
  paths,
  pendingWrites,
}: {
  packageSlug: string;
  paths: RuntimeConsolePaths;
  pendingWrites: PendingWrites;
}) => {
  const tsconfig = (await readJson(paths.tsconfigPath)) as {
    include?: string[];
  };
  tsconfig.include = appendListItem(
    tsconfig.include ?? [],
    `packages/${packageSlug}/src`
  );
  queueWrite(
    pendingWrites,
    paths.tsconfigPath,
    `${JSON.stringify(tsconfig, null, 2)}\n`
  );
};

const updateOxlintConfig = async ({
  packageSlug,
  paths,
  pendingWrites,
}: {
  packageSlug: string;
  paths: RuntimeConsolePaths;
  pendingWrites: PendingWrites;
}) => {
  const fileSource = await readFile(paths.oxlintConfigPath, "utf-8");
  const entry = `        "packages/${packageSlug}/src/**/*.{ts,tsx}",
`;
  queueWrite(
    pendingWrites,
    paths.oxlintConfigPath,
    insertBeforeNeedle(fileSource, entry, '        "vite.config.ts",')
  );
};

const updateManifestExports = async ({
  manifestName,
  packageName,
  paths,
  pendingWrites,
}: {
  manifestName: string;
  packageName: string;
  paths: RuntimeConsolePaths;
  pendingWrites: PendingWrites;
}) => {
  let fileSource = await readFile(paths.manifestExportsPath, "utf-8");
  fileSource = insertBeforeNeedle(
    fileSource,
    `import { ${manifestName} } from "${packageName}";
`,
    "export const consolePackageManifests"
  );
  fileSource = insertBeforeNeedle(
    fileSource,
    `  ${manifestName},\n`,
    "] as const;"
  );
  queueWrite(pendingWrites, paths.manifestExportsPath, fileSource);
};

const updateModuleExports = async ({
  manifestName,
  moduleName,
  packageName,
  paths,
  pendingWrites,
}: {
  manifestName: string;
  moduleName: string;
  packageName: string;
  paths: RuntimeConsolePaths;
  pendingWrites: PendingWrites;
}) => {
  let fileSource = await readFile(paths.moduleExportsPath, "utf-8");
  fileSource = insertBeforeNeedle(
    fileSource,
    `import { ${manifestName}, ${moduleName} } from "${packageName}";
`,
    "import {"
  );
  fileSource = insertBeforeNeedle(
    fileSource,
    `  [consolePackageKey(${manifestName})]: ${moduleName},
`,
    "} satisfies ConsolePackageModuleExportsByKey;"
  );
  queueWrite(pendingWrites, paths.moduleExportsPath, fileSource);
};

const manifestNameFromModuleExport = (moduleName: string) =>
  moduleName.endsWith("Module")
    ? `${moduleName.slice(0, -"Module".length)}Manifest`
    : `${moduleName}Manifest`;

const uniqueConsolePackagePlanItems = (
  installPlan: ConsolePackageInstallPlan
): ConsolePackageReference[] => {
  const itemsByKey = new Map<string, ConsolePackageReference>();
  for (const modulePlan of installPlan.modules ?? []) {
    for (const consolePackage of modulePlan.consolePackages ?? []) {
      if (!(consolePackage.packageName && consolePackage.exportName)) {
        continue;
      }
      const planItem = {
        ...consolePackage,
        exportName: String(consolePackage.exportName),
        packageName: String(consolePackage.packageName),
      };
      const key = consolePackageKey({
        exportName: planItem.exportName,
        packageName: planItem.packageName,
      });
      itemsByKey.set(key, planItem);
    }
  }
  return [...itemsByKey.values()];
};

export const applyConsolePackageInstallPlan = async ({
  options,
}: {
  options: CliOptions;
}) => {
  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : await findRepoRoot(process.cwd());
  const runtimeConsoleRoot = path.resolve(
    options.runtimeConsoleRoot ??
      (await defaultRuntimeConsoleRootForRepo(repoRoot))
  );
  const installPlanPath = path.resolve(
    options.installPlanFile ??
      path.join(repoRoot, ".lenso/console-package-install-plan.json")
  );
  const dependencyVersion = options.dependencyVersion ?? "latest";
  const installPlan = (await readJson(
    installPlanPath
  )) as ConsolePackageInstallPlan;
  const paths = runtimeConsolePaths(runtimeConsoleRoot);
  const packageJson = (await readJson(paths.packageJsonPath)) as PackageJson;
  let manifestExportsSource = await readFile(
    paths.manifestExportsPath,
    "utf-8"
  );
  let moduleExportsSource = await readFile(paths.moduleExportsPath, "utf-8");
  const pendingWrites: PendingWrites = new Map();
  const planItems = uniqueConsolePackagePlanItems(installPlan);

  for (const planItem of planItems) {
    const manifestName = manifestNameFromModuleExport(planItem.exportName);
    updateRuntimeConsoleDependency({
      dependencyVersion,
      packageJson,
      packageName: planItem.packageName,
    });
    manifestExportsSource = insertBeforeNeedle(
      manifestExportsSource,
      `import { ${manifestName} } from "${planItem.packageName}";
`,
      "export const consolePackageManifests"
    );
    manifestExportsSource = insertBeforeNeedle(
      manifestExportsSource,
      `  ${manifestName},\n`,
      "] as const;"
    );
    moduleExportsSource = insertBeforeNeedle(
      moduleExportsSource,
      `import { ${manifestName}, ${planItem.exportName} } from "${planItem.packageName}";
`,
      "import {"
    );
    moduleExportsSource = insertBeforeNeedle(
      moduleExportsSource,
      `  [consolePackageKey(${manifestName})]: ${planItem.exportName},
`,
      "} satisfies ConsolePackageModuleExportsByKey;"
    );
  }

  queueWrite(
    pendingWrites,
    paths.packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
  queueWrite(pendingWrites, paths.manifestExportsPath, manifestExportsSource);
  queueWrite(pendingWrites, paths.moduleExportsPath, moduleExportsSource);

  if (options.dryRun) {
    console.log("Console package install plan dry run:");
    for (const filePath of pendingWrites.keys()) {
      console.log(`- ${path.relative(repoRoot, filePath)}`);
    }
    return;
  }

  await writePendingFiles(pendingWrites);

  console.log(
    `Applied ${planItems.length} console package install plan item(s).`
  );
  console.log("Next steps:");
  console.log(
    `- pnpm --dir ${path.relative(repoRoot, runtimeConsoleRoot) || "."} install`
  );
  console.log(
    `- pnpm --dir ${path.relative(repoRoot, runtimeConsoleRoot) || "."} check:console-packages`
  );
  console.log("- pnpm check");
};

const queuePackageFiles = ({
  area,
  capability,
  componentName,
  icon,
  label,
  manifestName,
  moduleId,
  moduleName,
  packageDir,
  packageName,
  packagePrivate,
  pendingWrites,
  route,
  runtimeConsoleApiVersion,
  registrySource,
  surfaceName,
}: ConsolePackageContextWithWrites) => {
  const consoleSurfaceContract = {
    area,
    exportName: moduleName,
    icon,
    id: moduleId,
    label,
    navigation: {
      order: 10,
      workspace: {
        icon,
        id: moduleId,
        label,
      },
    },
    packageName,
    requiredCapabilities: [capability],
    route,
    source: registrySource,
    surfaceName,
    version: "workspace",
  };

  queueWrite(
    pendingWrites,
    path.join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        exports: {
          ".": "./src/index.tsx",
        },
        name: packageName,
        peerDependencies: {
          "@lenso/runtime-console-api": runtimeConsoleApiVersion,
          react: "^19.1.0",
        },
        private: packagePrivate,
        scripts: {
          check: "pnpm test && pnpm typecheck",
          test: 'echo "console package smoke passed"',
          typecheck: 'echo "console package typecheck placeholder"',
        },
        type: "module",
        version: "0.1.0",
      },
      null,
      2
    )}\n`
  );

  queueWrite(
    pendingWrites,
    path.join(packageDir, "console-surface.json"),
    `${JSON.stringify(consoleSurfaceContract, null, 2)}\n`
  );

  queueWrite(
    pendingWrites,
    path.join(packageDir, "console-surface.rs"),
    `use platform_module::{ConsoleArea, ConsolePackage, ConsoleSurface};

ConsoleSurface {
    name: "${surfaceName}".to_owned(),
    label: "${label}".to_owned(),
    area: ConsoleArea::${rustConsoleArea(area)},
    route: "${route}".to_owned(),
    package: ConsolePackage {
        name: "${packageName}".to_owned(),
        export: "${moduleName}".to_owned(),
    },
    icon: Some("${icon}".to_owned()),
    required_capabilities: vec!["${capability}".to_owned()],
    navigation: Some(platform_module::ConsoleNavigation {
        workspace: platform_module::ConsoleWorkspaceRef {
            id: "${moduleId}".to_owned(),
            label: "${label}".to_owned(),
            icon: Some("${icon}".to_owned()),
        },
        group: None,
        order: Some(10),
    }),
}
`
  );

  queueWrite(
    pendingWrites,
    path.join(packageDir, "src/manifest.ts"),
    `import { defineConsolePackageManifest } from "@lenso/runtime-console-api";

import consoleSurface from "../console-surface.json";

const consoleSurfaceContract = consoleSurface as unknown as {
  readonly area: "${area}";
  readonly exportName: "${moduleName}";
  readonly icon: "${icon}";
  readonly id: "${moduleId}";
  readonly label: "${label}";
  readonly navigation: {
    readonly order: 10;
    readonly workspace: {
      readonly icon: "${icon}";
      readonly id: "${moduleId}";
      readonly label: "${label}";
    };
  };
  readonly packageName: "${packageName}";
  readonly requiredCapabilities: readonly ["${capability}"];
  readonly route: "${route}";
  readonly source: "${registrySource}";
  readonly surfaceName: "${surfaceName}";
  readonly version: "workspace";
};

export const ${manifestName} = defineConsolePackageManifest(
  consoleSurfaceContract
);
`
  );

  queueWrite(
    pendingWrites,
    path.join(packageDir, "src/page.tsx"),
    `export function ${componentName}() {
  return (
    <main className="flex min-h-screen flex-col gap-3 px-6 py-5">
      <header>
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-normal">
          ${label}
        </p>
        <h1 className="font-semibold text-2xl text-foreground">${label}</h1>
      </header>
    </main>
  );
}
`
  );

  queueWrite(
    pendingWrites,
    path.join(packageDir, "src/index.tsx"),
    `import { defineConsoleModule } from "@lenso/runtime-console-api";

import { ${manifestName} } from "./manifest";
import { ${componentName} } from "./page";

export const ${moduleName} = defineConsoleModule({
  id: ${manifestName}.id,
  surfaces: [
    {
      area: ${manifestName}.area,
      component: ${componentName},
      icon: ${manifestName}.icon,
      label: ${manifestName}.label,
      navigation: ${manifestName}.navigation,
      path: ${manifestName}.route,
    },
  ],
});

export { ${manifestName} } from "./manifest";
export { ${componentName} } from "./page";
`
  );

  queueWrite(
    pendingWrites,
    path.join(packageDir, "src/index.test.tsx"),
    `import { describe, expect, test } from "vitest";

import { ${componentName}, ${manifestName}, ${moduleName} } from ".";

describe("${packageName}", () => {
  test("exports a console module manifest and route", () => {
    expect(${manifestName}).toMatchObject({
      exportName: "${moduleName}",
      id: "${moduleId}",
      packageName: "${packageName}",
      route: "${route}",
    });
    expect(${moduleName}).toMatchObject({
      id: ${manifestName}.id,
      surfaces: [
        {
          area: ${manifestName}.area,
          icon: ${manifestName}.icon,
          label: ${manifestName}.label,
          path: ${manifestName}.route,
        },
      ],
    });
    expect(${moduleName}.surfaces[0]?.component).toBe(${componentName});
  });
});
`
  );
};

export const buildConsolePackageContext = ({
  options,
  runtimeConsoleRoot,
}: {
  options: CliOptions;
  runtimeConsoleRoot: string;
}): ConsolePackageContext => {
  const paths = runtimeConsolePaths(runtimeConsoleRoot);
  const moduleId = slugify(options.moduleId ?? "");
  const packageSlug = slugify(options.packageSlug ?? `${moduleId}-console`);
  const packageName =
    options.packageName ?? `${options.packageScope ?? "@lenso"}/${packageSlug}`;
  const area = options.area ?? "data";
  const label = options.label ?? titleCase(moduleId);
  const route = options.route ?? `/${area}/${moduleId}`;
  const registrySource = options.source ?? "installed";
  const icon = options.icon ?? defaultIcon(area);
  const capability = options.capability ?? `${moduleId}.read`;
  const surfaceName = options.surfaceName ?? moduleId;
  const exportStem = exportStemFromPackageSlug(packageSlug);
  const manifestName = `${exportStem}Manifest`;
  const moduleName = `${exportStem}Module`;
  const componentName = `${pascalCase(moduleId)}ConsolePage`;
  const packageDir = path.join(runtimeConsoleRoot, "packages", packageSlug);

  return {
    area,
    capability,
    componentName,
    icon,
    label,
    manifestName,
    moduleId,
    moduleName,
    packageDir,
    packageName,
    packagePrivate: options.packagePrivate ?? true,
    packageSlug,
    paths,
    registrySource,
    route,
    runtimeConsoleApiVersion: options.runtimeConsoleApiVersion ?? "workspace:*",
    surfaceName,
  };
};

export const queueRemoteConsolePackageFiles = ({
  packageContext,
  pendingWrites,
}: {
  packageContext: ConsolePackageContext;
  pendingWrites: PendingWrites;
}) => {
  queuePackageFiles({ ...packageContext, pendingWrites });
};

export const createConsolePackage = async ({
  defaultRuntimeConsoleRoot,
  options,
}: {
  defaultRuntimeConsoleRoot: string | undefined;
  options: CliOptions;
}) => {
  const runtimeConsoleRoot = path.resolve(
    options.runtimeConsoleRoot ?? defaultRuntimeConsoleRoot ?? process.cwd()
  );
  const packageContext = buildConsolePackageContext({
    options,
    runtimeConsoleRoot,
  });

  if (await pathExists(packageContext.packageDir)) {
    throw new Error(
      `Console package directory already exists: ${relativePath(
        runtimeConsoleRoot,
        packageContext.packageDir
      )}`
    );
  }

  const pendingWrites: PendingWrites = new Map();
  const packageContextWithWrites: ConsolePackageContextWithWrites = {
    ...packageContext,
    pendingWrites,
  };

  queuePackageFiles(packageContextWithWrites);
  await updatePackageJson(packageContextWithWrites);
  await updateTsconfig(packageContextWithWrites);
  await updateOxlintConfig(packageContextWithWrites);
  await updateManifestExports(packageContextWithWrites);
  await updateModuleExports(packageContextWithWrites);

  if (options.dryRun) {
    console.log("Console package dry run:");
    for (const filePath of pendingWrites.keys()) {
      console.log(`- ${relativePath(runtimeConsoleRoot, filePath)}`);
    }
    return;
  }

  await writePendingFiles(pendingWrites);

  console.log(`Created ${packageContext.packageName}.`);
  console.log("Next steps:");
  console.log(
    `- Copy ${packageContext.packageSlug}/console-surface.rs into the Rust module manifest`
  );
  console.log(
    `- Keep navigation.workspace.id="${packageContext.moduleId}" so the module owns its workspace`
  );
  console.log("- Omit navigation only for host System surfaces");
  console.log("- pnpm install --lockfile-only");
  console.log("- pnpm check:console-packages");
  console.log("- pnpm check");
};
