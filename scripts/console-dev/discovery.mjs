import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const discoverConsoleDevTargets = async ({ cwd, packagePath } = {}) => {
  const root = path.resolve(packagePath ?? cwd ?? process.cwd());
  const direct = await maybeConsolePackage(root);
  if (direct) {
    return [direct];
  }

  const packageDirs = await candidatePackageDirs(root);
  const targets = [];
  for (const dir of packageDirs) {
    const target = await maybeConsolePackage(dir);
    if (target) {
      targets.push(target);
    }
  }
  targets.sort((a, b) => a.packageName.localeCompare(b.packageName));

  if (targets.length === 0) {
    throw new Error(`No Runtime Console package found under ${root}`);
  }
  return targets;
};

const maybeConsolePackage = async (packageRoot) => {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = await readJson(packageJsonPath).catch(() => null);
  if (!packageJson) {
    return null;
  }

  const consoleConfig = packageJson.lenso?.console ?? {};
  const surfacePath = path.resolve(
    packageRoot,
    consoleConfig.surface ?? "console-surface.json"
  );
  const surface = await readJson(surfacePath).catch(() => null);
  if (!surface) {
    return null;
  }

  return consoleTargetFromConfig({
    consoleConfig,
    packageJson,
    packageRoot,
    surface,
    surfacePath,
  });
};

const consoleTargetFromConfig = ({
  consoleConfig,
  packageJson,
  packageRoot,
  surface,
  surfacePath,
}) => {
  const firstSurface = firstConsoleSurface(surface);
  const { exportName } = surface;
  const packageName = surface.packageName ?? packageJson.name;
  if (!(packageName && exportName)) {
    throw new Error(
      `Console package ${packageRoot} must declare packageName and exportName`
    );
  }

  return {
    bundle: consoleBundlePath(consoleConfig, surface),
    exportName,
    hostApi: consoleHostApi(consoleConfig, surface),
    moduleName: consoleModuleName({ firstSurface, packageJson, surface }),
    packageName,
    packageRoot,
    requiredCapabilities: requiredCapabilitiesFor(firstSurface),
    route: consoleRoute(firstSurface, surface),
    styles: consoleStyles(consoleConfig, surface),
    surfacePath,
  };
};

const firstConsoleSurface = (surface) =>
  Array.isArray(surface.surfaces) ? surface.surfaces[0] : surface;

const consoleBundlePath = (consoleConfig, surface) =>
  consoleConfig.bundle ?? surface.bundle?.path ?? null;

const consoleHostApi = (consoleConfig, surface) =>
  consoleConfig.hostApi ?? surface.bundle?.hostApi ?? "1";

const consoleModuleName = ({ firstSurface, packageJson, surface }) =>
  surface.id ?? firstSurface?.surfaceName ?? packageJson.name;

const requiredCapabilitiesFor = (firstSurface) =>
  firstSurface?.requiredCapabilities ?? [];

const consoleRoute = (firstSurface, surface) =>
  firstSurface?.route ?? surface.route ?? "/";

const consoleStyles = (consoleConfig, surface) =>
  consoleConfig.styles ?? surface.bundle?.styles ?? [];

const candidatePackageDirs = async (root) => {
  const packagesRoot = path.join(root, "packages");
  const entries = await readdir(packagesRoot).catch(() => []);
  const dirs = [];
  for (const entry of entries) {
    const dir = path.join(packagesRoot, entry);
    const info = await stat(dir).catch(() => null);
    if (info?.isDirectory()) {
      dirs.push(dir);
    }
  }
  return dirs;
};

const readJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf-8"));
