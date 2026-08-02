import { isConsoleSurfaceIcon } from "../../packages/console-ui-internal/src/index";
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
  availableCapabilities: readonly string[]
) {
  const available = new Set(availableCapabilities);
  const linked = buildConsoleNavigation(consoleModules);
  const isolated = modules.flatMap((module) =>
    (module.console ?? []).flatMap((surface) => {
      if (
        surface.presentation?.kind !== "isolated" ||
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
  return [...linked, ...isolated];
}

export function useConsoleNavigation() {
  const availableCapabilities = useConsoleCapabilities();
  const modulesQuery = useConsoleModulesMetadata();
  const modules = consoleModuleMetadataWithFallback({
    apiMode: false,
    data: modulesQuery.data?.modules,
  });

  return navigationFromConsoleModuleMetadata(modules, availableCapabilities);
}
