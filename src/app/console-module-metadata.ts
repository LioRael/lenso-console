import { isApiMode } from "../lib/http-client";
import { useConsoleCapabilities } from "./console-capabilities";
import { useConsoleModulesMetadata } from "./console-module-metadata-query";
import {
  type ConsoleModuleMetadata,
  createDevManualConsolePackageInstaller,
  missingConsolePackageReferences,
  planConsolePackageInstall,
  resolveConsoleModules,
  selectConsoleModulePackageReferences,
} from "./console-module-resolver";
import {
  buildConsoleNavigation,
  buildTimeConsoleModuleMetadata,
} from "./console-modules";
import type { InstalledConsolePackage } from "./console-package-registry";

const runtimeConsoleModuleMetadata: ConsoleModuleMetadata[] = [];

export function registerRuntimeConsoleModuleMetadata(
  packages: readonly InstalledConsolePackage[]
) {
  runtimeConsoleModuleMetadata.push(
    ...packages.map((item) => ({
      console: item.module.surfaces.map((surface) => {
        const metadata: NonNullable<ConsoleModuleMetadata["console"]>[number] =
          {
            area: surface.area,
            label: surface.label,
            package: {
              export: item.exportName,
              name: item.packageName,
            },
            route: surface.path,
          };
        if (surface.icon) {
          metadata.icon = surface.icon;
        }
        if (surface.navigation) {
          metadata.navigation = surface.navigation;
        }
        return metadata;
      }),
      module_name: item.module.id,
    }))
  );
}

export function consoleModuleMetadataWithFallback({
  apiMode,
  data,
}: {
  apiMode: boolean;
  data?: ConsoleModuleMetadata[] | undefined;
}): ConsoleModuleMetadata[] {
  if (data) {
    return data;
  }
  if (apiMode) {
    return [];
  }
  return [...buildTimeConsoleModuleMetadata, ...runtimeConsoleModuleMetadata];
}

export function navigationFromConsoleModuleMetadata(
  modules: ConsoleModuleMetadata[],
  availableCapabilities: readonly string[]
) {
  return buildConsoleNavigation(
    resolveConsoleModules(
      selectConsoleModulePackageReferences(modules, { availableCapabilities })
    )
  );
}

export function missingConsolePackagesFromMetadata(
  modules: ConsoleModuleMetadata[]
) {
  return missingConsolePackageReferences(modules);
}

export function consolePackageInstallPlanFromMetadata(
  modules: ConsoleModuleMetadata[]
) {
  return planConsolePackageInstall(missingConsolePackagesFromMetadata(modules));
}

export async function previewConsolePackageInstallResults(
  modules: ConsoleModuleMetadata[]
) {
  const installer = createDevManualConsolePackageInstaller();
  return Promise.all(
    consolePackageInstallPlanFromMetadata(modules).map((plan) =>
      installer.install(plan)
    )
  );
}

export function useConsoleNavigation() {
  const apiMode = isApiMode();
  const availableCapabilities = useConsoleCapabilities();
  const modulesQuery = useConsoleModulesMetadata();
  const modules = consoleModuleMetadataWithFallback({
    apiMode,
    data: modulesQuery.data?.modules,
  });

  return navigationFromConsoleModuleMetadata(modules, availableCapabilities);
}
