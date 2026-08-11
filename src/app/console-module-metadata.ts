import { isConsoleSurfaceIcon } from "@lenso/console-ui";
import type { ConsoleSystemConnection } from "@lenso/console-ui";
import { useSyncExternalStore } from "react";

import { useConsoleAdminContext } from "./console-admin-context";
import {
  getConsoleArtifactQuarantines,
  subscribeConsoleArtifactQuarantine,
} from "./console-artifact-quarantine";
import {
  useConsoleArtifacts,
  type ConsoleArtifactReceipt,
} from "./console-artifact-query";
import { useConsoleCapabilities } from "./console-capabilities";
import { hasConsoleCapability } from "./console-capability-matching";
import { useConsoleModulesMetadata } from "./console-module-metadata-query";
import type { ConsoleModuleMetadata } from "./console-module-resolver";
import { buildConsoleNavigation, consoleModules } from "./console-modules";
import { useConsoleSystemConnection } from "./console-system-connection-api";
import {
  connectionModuleForArtifact,
  connectionModuleState,
} from "./console-system-connection-model";

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
  artifacts: readonly ConsoleArtifactReceipt[] = [],
  quarantinedArtifactKeys: ReadonlySet<string> = new Set(),
  connection?: ConsoleSystemConnection | null,
  managedServiceCapabilities: Readonly<Record<string, readonly string[]>> = {}
) {
  const linked = buildConsoleNavigation(consoleModules).filter((item) => {
    if (connection === undefined || item.moduleId !== "lenso/platform-story") {
      return true;
    }
    const storyArtifacts = artifacts.filter(
      (artifact) => artifact.moduleId === item.moduleId
    );
    if (storyArtifacts.length > 0) {
      return storyArtifacts.some(
        (artifact) =>
          connectionModuleForArtifact(connection, artifact)?.status ===
          "connected"
      );
    }
    return (
      connectionModuleState(connection, item.moduleId)?.status === "connected"
    );
  });
  const dynamic = modules.flatMap((module) =>
    (module.console ?? []).flatMap((surface) => {
      const connectionModule = connectionModuleState(
        connection,
        module.module_name ?? ""
      );
      const available = capabilitiesForConnectedService(
        availableCapabilities,
        connectionModule?.serviceId,
        managedServiceCapabilities
      );
      if (
        connection !== undefined &&
        connectionModule?.status !== "connected"
      ) {
        return [];
      }
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
        quarantinedArtifactKeys.has(
          `${artifact.moduleId}:${artifact.artifactDigest}`
        )
      ) {
        return [];
      }
      const connectionModule = connectionModuleForArtifact(connection, {
        artifactDigest: artifact.artifactDigest,
        moduleId: artifact.moduleId,
        moduleReleaseDigest: artifact.moduleReleaseDigest,
      });
      const available = capabilitiesForConnectedService(
        availableCapabilities,
        connectionModule?.serviceId,
        managedServiceCapabilities
      );
      if (
        connection !== undefined &&
        connectionModule?.status !== "connected"
      ) {
        return [];
      }
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
  const adminContextQuery = useConsoleAdminContext();
  const modulesQuery = useConsoleModulesMetadata();
  const artifactsQuery = useConsoleArtifacts();
  const systemConnectionQuery = useConsoleSystemConnection();
  const quarantines = useSyncExternalStore(
    subscribeConsoleArtifactQuarantine,
    getConsoleArtifactQuarantines,
    getConsoleArtifactQuarantines
  );
  const modules = consoleModuleMetadataWithFallback({
    apiMode: false,
    data: modulesQuery.data?.modules,
  });

  return navigationFromConsoleModuleMetadata(
    modules,
    availableCapabilities,
    artifactsQuery.data?.artifacts ?? [],
    new Set(quarantines.map((quarantine) => quarantine.key)),
    systemConnectionQuery.data ?? null,
    adminContextQuery.data?.managed_service_capabilities ?? {}
  );
}

function capabilitiesForConnectedService(
  globalCapabilities: readonly string[],
  serviceId: string | null | undefined,
  managedServiceCapabilities: Readonly<Record<string, readonly string[]>>
): ReadonlySet<string> {
  return new Set([
    ...globalCapabilities,
    ...(serviceId ? (managedServiceCapabilities[serviceId] ?? []) : []),
  ]);
}
