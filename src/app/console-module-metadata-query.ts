import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../lib/http-client";
import {
  consoleArtifactReceiptQueryKey,
  type ConsoleArtifactReceiptResponse,
  type ConsoleArtifactReceipt,
} from "./console-artifact-query";
import type { ConsoleModuleMetadata } from "./console-module-resolver";

export function useConsoleModulesMetadata() {
  return useQuery({
    enabled: isApiMode(),
    queryKey: consoleArtifactReceiptQueryKey,
    queryFn: () =>
      httpClient
        .get("api/console/v1/artifacts")
        .json<ConsoleArtifactReceiptResponse>(),
    select: (response) => ({
      modules: response.artifacts.map(consoleModuleMetadataFromArtifact),
    }),
  });
}

export function consoleModuleMetadataFromArtifact(
  artifact: ConsoleArtifactReceipt
): ConsoleModuleMetadata {
  return {
    module_name: artifact.moduleId,
    status: "loaded",
    console: artifact.manifest.surfaces.map((surface) => ({
      area: surface.area,
      label: surface.label,
      name: surface.id,
      presentation: {
        artifact_digest: artifact.artifactDigest,
        entry: artifact.entry,
        kind: "esm",
      },
      route: surface.path,
      ...(surface.icon ? { icon: surface.icon } : {}),
      ...(surface.navigation ? { navigation: surface.navigation } : {}),
      ...(surface.requiredCapabilities
        ? { required_capabilities: surface.requiredCapabilities }
        : {}),
    })),
  };
}
