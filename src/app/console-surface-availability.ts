import type {
  ConsoleConnectionStatus,
  ConsoleSystemConnection,
} from "@lenso/console-ui";
import { useMemo } from "react";

import { isApiMode } from "../lib/http-client";
import { useConsoleAdminContext } from "./console-admin-context";
import type { ConsoleArtifactReceipt } from "./console-artifact-query";
import { useConsoleArtifacts } from "./console-artifact-query";
import { useConsoleCapabilities } from "./console-capabilities";
import { hasConsoleCapability } from "./console-capability-matching";
import { useConsoleSystemConnection } from "./console-system-connection-api";
import { connectionModuleForArtifact } from "./console-system-connection-model";

export type ConsoleSurfaceAvailability = {
  label: string;
  moduleId: string;
  path: string;
  reason: string | null;
  serviceId: string | null;
  status: ConsoleConnectionStatus;
  surfaceId: string;
};

export function consoleSurfaceAvailability({
  artifacts,
  availableCapabilities,
  connection,
  managedServiceCapabilities,
}: {
  artifacts: readonly ConsoleArtifactReceipt[];
  availableCapabilities: readonly string[];
  connection: ConsoleSystemConnection | null | undefined;
  managedServiceCapabilities: Readonly<Record<string, readonly string[]>>;
}): ConsoleSurfaceAvailability[] {
  if (connection === null) {
    return [];
  }
  const declared = artifacts.flatMap((artifact) => {
    const connectionModule = connectionModuleForArtifact(connection, artifact);
    const serviceId = connectionModule?.serviceId ?? null;
    const actorCapabilities = new Set([
      ...availableCapabilities,
      ...(serviceId ? (managedServiceCapabilities[serviceId] ?? []) : []),
    ]);
    return artifact.manifest.surfaces.flatMap((surface) => {
      const requiredCapabilities = surface.requiredCapabilities ?? [];
      const missingCapabilities = requiredCapabilities.filter(
        (capability) => !hasConsoleCapability(actorCapabilities, capability)
      );
      const unauthorized =
        (connectionModule?.status === "connected" &&
          missingCapabilities.length > 0) ||
        (connection === undefined &&
          noPossibleServiceAuthority({
            availableCapabilities,
            managedServiceCapabilities,
            requiredCapabilities,
          }));
      if (connection === undefined && !unauthorized) {
        return [];
      }
      return [
        {
          label: surface.label,
          moduleId: artifact.moduleId,
          path: surface.path,
          reason: unauthorized
            ? `Current operator lacks the required Surface Entry Capability: ${missingCapabilities.join(", ")}`
            : (connectionModule?.reason ?? null),
          serviceId,
          status: unauthorized
            ? "unavailable"
            : (connectionModule?.status ?? "unmanaged"),
          surfaceId: surface.id,
        },
      ];
    });
  });
  if (!connection) {
    return declared;
  }
  const artifactModules = new Set(
    artifacts.map((artifact) => artifact.moduleId)
  );
  const missing = connection.modules.flatMap((module) => {
    if (
      artifactModules.has(module.moduleId) ||
      !KNOWN_SURFACE_MODULES.has(module.moduleId) ||
      isConnectedConsoleOwnedStory(module)
    ) {
      return [];
    }
    const expected = Boolean(module.consoleUiArtifactDigest);
    return [
      {
        label: module.moduleId,
        moduleId: module.moduleId,
        path: "/modules",
        reason: expected
          ? "The exact Console UI artifact receipt has not been reconciled for this Module Release"
          : "The connected Module Release does not declare a Console UI artifact",
        serviceId: module.serviceId ?? null,
        status: "incompatible" as const,
        surfaceId: "missing-console-ui-artifact",
      },
    ];
  });
  return [...declared, ...missing];
}

const KNOWN_SURFACE_MODULES = new Set(["lenso/auth", "lenso/platform-story"]);

function isConnectedConsoleOwnedStory(
  module: ConsoleSystemConnection["modules"][number]
) {
  return (
    module.moduleId === "lenso/platform-story" &&
    module.delivery === "linked" &&
    module.status === "connected" &&
    !module.consoleUiArtifactDigest
  );
}

export function useConsoleSurfaceAvailability(): ConsoleSurfaceAvailability[] {
  const apiMode = isApiMode();
  const artifacts = useConsoleArtifacts();
  const adminContext = useConsoleAdminContext();
  const availableCapabilities = useConsoleCapabilities();
  const systemConnection = useConsoleSystemConnection();

  return useMemo(() => {
    if (
      !apiMode ||
      artifacts.isPending ||
      artifacts.isError ||
      adminContext.isPending ||
      adminContext.isError ||
      systemConnection.isPending
    ) {
      return [];
    }
    return consoleSurfaceAvailability({
      artifacts: artifacts.data?.artifacts ?? [],
      availableCapabilities,
      connection: systemConnection.isError ? undefined : systemConnection.data,
      managedServiceCapabilities:
        adminContext.data?.managed_service_capabilities ?? {},
    });
  }, [
    adminContext.data?.managed_service_capabilities,
    adminContext.isError,
    adminContext.isPending,
    apiMode,
    artifacts.data?.artifacts,
    artifacts.isError,
    artifacts.isPending,
    availableCapabilities,
    systemConnection.data,
    systemConnection.isError,
    systemConnection.isPending,
  ]);
}

function noPossibleServiceAuthority({
  availableCapabilities,
  managedServiceCapabilities,
  requiredCapabilities,
}: {
  availableCapabilities: readonly string[];
  managedServiceCapabilities: Readonly<Record<string, readonly string[]>>;
  requiredCapabilities: readonly string[];
}): boolean {
  if (requiredCapabilities.length === 0) {
    return false;
  }
  const candidates = [
    availableCapabilities,
    ...Object.values(managedServiceCapabilities).map((capabilities) => [
      ...availableCapabilities,
      ...capabilities,
    ]),
  ];
  return !candidates.some((capabilities) => {
    const available = new Set(capabilities);
    return requiredCapabilities.every((capability) =>
      hasConsoleCapability(available, capability)
    );
  });
}
