import { isConsoleSurfaceIcon } from "@lenso/console-ui";

import {
  useConsoleArtifacts,
  type ConsoleArtifactReceipt,
} from "./console-artifact-query";
import { useConsoleCapabilities } from "./console-capabilities";
import { hasConsoleCapability } from "./console-capability-matching";
import { useConsoleModulesMetadata } from "./console-module-metadata-query";
import type { ConsoleModuleMetadata } from "./console-module-resolver";
import { buildConsoleNavigation, consoleModules } from "./console-modules";

export function consoleModuleMetadataWithFallback({
  apiMode: _apiMode,
  data,
}: {
  apiMode: boolean;
  data?: ConsoleModuleMetadata[] | undefined;
}): ConsoleModuleMetadata[] {
  return data ?? [];
}

export function navigationFromConsoleModuleMetadata(
  modules: ConsoleModuleMetadata[],
  availableCapabilities: readonly string[],
  artifacts: readonly ConsoleArtifactReceipt[] = []
) {
  const available = new Set(availableCapabilities);
  const linked = buildConsoleNavigation(consoleModules);
  const dynamic = modules.flatMap((module) =>
    (module.console ?? []).flatMap((surface) => {
      if (
        surface.presentation?.kind !== "esm" ||
        !(surface.label && surface.route) ||
        !(surface.required_capabilities ?? []).every((capability) =>
          hasConsoleCapability(available, capability)
        )
      ) {
        return [];
      }
      return [
        {
          ...(isConsoleSurfaceIcon(surface.icon) ? { icon: surface.icon } : {}),
          label: surface.label,
          moduleId: module.module_name ?? "unknown",
          ...(surface.navigation ? { navigation: surface.navigation } : {}),
          path: surface.route,
        },
      ];
    })
  );
  const artifactNavigation = artifacts.flatMap((artifact) =>
    artifact.manifest.surfaces.flatMap((surface) => {
      if (
        !(surface.requiredCapabilities ?? []).every((capability) =>
          hasConsoleCapability(available, capability)
        )
      ) {
        return [];
      }
      return [
        {
          ...(isConsoleSurfaceIcon(surface.icon) ? { icon: surface.icon } : {}),
          label: surface.label,
          moduleId: artifact.moduleId,
          ...(surface.localizedLabels
            ? { localizedLabels: surface.localizedLabels }
            : {}),
          ...(surface.navigation ? { navigation: surface.navigation } : {}),
          path: surface.path,
        },
      ];
    })
  );
  const byPath = new Map<string, (typeof linked)[number]>();
  for (const item of [...linked, ...dynamic, ...artifactNavigation]) {
    byPath.set(item.path, item);
  }
  return [...byPath.values()];
}

export function useConsoleNavigation() {
  const availableCapabilities = useConsoleCapabilities();
  const modulesQuery = useConsoleModulesMetadata();
  const artifactsQuery = useConsoleArtifacts();
  const modules = consoleModuleMetadataWithFallback({
    apiMode: false,
    data: modulesQuery.data?.modules,
  });

  return navigationFromConsoleModuleMetadata(
    modules,
    availableCapabilities,
    artifactsQuery.data?.artifacts ?? []
  );
}
