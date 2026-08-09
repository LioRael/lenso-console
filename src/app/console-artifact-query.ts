import type { ConsoleThemeBundleReceipt } from "@lenso/console-composition-api";
import type {
  ConsoleModuleManifest,
  FrameworkConsoleUiEsmArtifact,
} from "@lenso/console-module-api";
import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../lib/http-client";

export type ConsoleArtifactEntry = { name: string; path: string };
export type ConsoleArtifactStyleAsset = {
  path: string;
  order?: number;
  media?: string;
};

export type ConsoleArtifactReceipt = {
  /** Local serving metadata is bound to this exact framework artifact. */
  contract?: FrameworkConsoleUiEsmArtifact;
  format: "console_ui_esm";
  protocolMajor?: number;
  moduleId: string;
  moduleReleaseDigest: `sha256:${string}`;
  artifactDigest: `sha256:${string}`;
  basePath: string;
  entry: string;
  entries: readonly ConsoleArtifactEntry[];
  styleAssets?: readonly ConsoleArtifactStyleAsset[];
  manifest: ConsoleModuleManifest;
  grantedPermissions: readonly string[];
};

export type ConsoleArtifactReceiptResponse = {
  candidateLockDigest?: string;
  artifacts: readonly ConsoleArtifactReceipt[];
  themeBundles?: readonly ConsoleThemeBundleReceipt[];
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

export const consoleThemeBundleQueryKey = ["console", "theme-bundles"] as const;

export function useConsoleThemeBundles() {
  return useQuery({
    enabled: isApiMode(),
    queryFn: async () => {
      const response = await httpClient
        .get("api/console/v1/artifacts")
        .json<ConsoleArtifactReceiptResponse>();
      return response.themeBundles ?? [];
    },
    queryKey: consoleThemeBundleQueryKey,
  });
}
