import type { ConsoleModuleManifest } from "@lenso/console-module-api";
import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../lib/http-client";

export type ConsoleArtifactEntry = { name: string; path: string };

export type ConsoleArtifactReceipt = {
  format: "console_ui_esm";
  moduleId: string;
  moduleReleaseDigest: `sha256:${string}`;
  artifactDigest: `sha256:${string}`;
  basePath: string;
  entry: string;
  entries: readonly ConsoleArtifactEntry[];
  manifest: ConsoleModuleManifest;
  grantedPermissions: readonly string[];
};

export type ConsoleArtifactReceiptResponse = {
  candidateLockDigest?: string;
  artifacts: readonly ConsoleArtifactReceipt[];
};

export const consoleArtifactReceiptQueryKey = ["console", "artifacts"] as const;

export function useConsoleArtifacts() {
  return useQuery({
    enabled: isApiMode(),
    queryFn: () =>
      httpClient
        .get("api/console/v1/artifacts")
        .json<ConsoleArtifactReceiptResponse>(),
    queryKey: consoleArtifactReceiptQueryKey,
  });
}
