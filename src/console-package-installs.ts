import {
  consolePackageKey,
  resolveInstalledConsolePackages,
  type InstalledConsolePackage,
} from "./app/console-package-registry";
import { consolePackageInstallManifests } from "./console-package-install-manifests";
import { consolePackageModuleExportsByKey } from "./console-package-module-exports";

export const installedConsolePackages = resolveInstalledConsolePackages(
  consolePackageInstallManifests,
  consolePackageModuleExportsByKey
);

export function registerRuntimeConsolePackages(
  packages: readonly InstalledConsolePackage[]
) {
  const installedKeys = new Set(
    installedConsolePackages.map(consolePackageKey)
  );
  for (const item of packages) {
    const key = consolePackageKey(item);
    if (installedKeys.has(key)) {
      continue;
    }
    installedConsolePackages.push(item);
    installedKeys.add(key);
  }
}
