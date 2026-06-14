export type JsonRecord = Record<string, unknown>;
export type PendingWrites = Map<string, string>;

export interface RuntimeConsolePaths {
  manifestExportsPath: string;
  moduleExportsPath: string;
  oxlintConfigPath: string;
  packageJsonPath: string;
  tsconfigPath: string;
  viteConfigPath: string;
}

export interface RepoPaths {
  appBootstrapCargoTomlPath: string;
  appBootstrapLibPath: string;
  cargoTomlPath: string;
}

export interface PackageJson extends JsonRecord {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface CliOptions extends JsonRecord {
  area?: string;
  baseUrl?: string;
  capability?: string;
  catalogFile?: string;
  dependencyVersion?: string;
  dryRun?: boolean;
  envFile?: string;
  icon?: string;
  installPlanFile?: string;
  label?: string;
  moduleId?: string;
  outputDir?: string;
  packageName?: string;
  packagePrivate?: boolean;
  packageRoot?: string;
  packageScope?: string;
  packageSlug?: string;
  remote?: boolean;
  repoRoot?: string;
  route?: string;
  runtimeConsoleApiVersion?: string;
  runtimeConsoleRoot?: string;
  source?: string;
  summary?: string;
  surfaceName?: string;
  withConsole?: boolean;
}

export interface ConsolePackageReference extends JsonRecord {
  exportName: string;
  packageName: string;
}

export interface ConsoleSurfaceManifest extends JsonRecord {
  label?: string;
  name?: string;
  package?: {
    export?: string;
    name?: string;
  };
  route?: string;
}

export interface RemoteModuleManifest extends JsonRecord {
  capabilities: unknown[];
  console: ConsoleSurfaceManifest[];
  name: string;
  source: "remote";
  summary?: string;
  version: string;
}

export interface ConsolePackageInstallPlan extends JsonRecord {
  modules?: (JsonRecord & {
    consolePackages?: JsonRecord[];
    moduleName?: string;
  })[];
}

export interface ModuleCatalog {
  modules: JsonRecord[];
  version: number;
}

export interface ConsolePackageContext {
  area: string;
  capability: string;
  componentName: string;
  icon: string;
  label: string;
  manifestName: string;
  moduleId: string;
  moduleName: string;
  packageDir: string;
  packageName: string;
  packagePrivate: boolean;
  packageSlug: string;
  paths: RuntimeConsolePaths;
  registrySource: string;
  route: string;
  runtimeConsoleApiVersion: string;
  surfaceName: string;
}

export type ConsolePackageContextWithWrites = ConsolePackageContext & {
  pendingWrites: PendingWrites;
};

export interface ModuleContext {
  consoleSurface: ConsolePackageContext | undefined;
  moduleCrate: string;
  moduleDir: string;
  moduleId: string;
  paths: RepoPaths;
  pendingWrites: PendingWrites;
}

export interface RemoteModuleEntry {
  baseUrl: string;
  name: string;
}
