import { installConsoleBridgeHost } from "@lenso/console-bridge";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { httpClient } from "../lib/http-client";
import { useConsoleModulesMetadata } from "./console-module-metadata-query";
import type { ConsoleModuleMetadata } from "./console-module-resolver";

type ArtifactEntry = { name: string; path: string };
type MaterializedArtifact = {
  moduleId: string;
  moduleReleaseDigest: string;
  artifactDigest: string;
  basePath: string;
  entries: ArtifactEntry[];
  grantedPermissions: string[];
};
type ArtifactReceipt = { artifacts: MaterializedArtifact[] };

const artifactReceiptQueryKey = ["console", "artifacts"] as const;

export function IsolatedConsoleModulePage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const modules = useConsoleModulesMetadata();
  const artifacts = useQuery({
    queryFn: () =>
      httpClient.get("api/console/v1/artifacts").json<ArtifactReceipt>(),
    queryKey: artifactReceiptQueryKey,
  });
  const selection = useMemo(
    () => isolatedSurfaceForPath(modules.data?.modules ?? [], path),
    [modules.data?.modules, path]
  );

  if (modules.isPending || artifacts.isPending) {
    return <ModuleState title="Loading Module UI" />;
  }
  if (modules.isError) {
    return <ModuleState title="Module metadata is unavailable" />;
  }
  if (!selection) {
    return <ModuleState title="Console page not found" />;
  }
  const artifact = artifacts.data?.artifacts.find(
    (item) => item.moduleId === selection.moduleId
  );
  const entry = artifact?.entries.find(
    (item) => item.name === selection.entryName
  );
  if (!(artifact && entry)) {
    return (
      <ModuleState title="Module UI is not materialized">
        Apply a reviewed Console composition containing this exact Module UI
        artifact.
      </ModuleState>
    );
  }
  return (
    <IsolatedFrame
      artifact={artifact}
      entry={entry}
      moduleId={selection.moduleId}
      surface={selection.surface}
      title={selection.label}
    />
  );
}

function IsolatedFrame({
  artifact,
  entry,
  moduleId,
  surface,
  title,
}: {
  artifact: MaterializedArtifact;
  entry: ArtifactEntry;
  moduleId: string;
  surface: string;
  title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!frame.current) {
      return;
    }
    return installConsoleBridgeHost({
      frame: frame.current,
      grant: {
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        grantedPermissions: artifact.grantedPermissions,
        moduleId,
        moduleReleaseDigest: artifact.moduleReleaseDigest,
        uiArtifactDigest: artifact.artifactDigest,
      },
      invoke: (permission, payload) =>
        httpClient
          .post(
            `modules/${encodeURIComponent(moduleId)}/http/console-bridge/${encodeURIComponent(permission)}`,
            {
              json: {
                moduleReleaseDigest: artifact.moduleReleaseDigest,
                payload,
                permission,
                uiArtifactDigest: artifact.artifactDigest,
              },
            }
          )
          .json(),
      surface,
    });
  }, [artifact, moduleId, surface]);

  return (
    <iframe
      className="h-[calc(100vh-var(--console-topbar-height))] w-full border-0 bg-(--bg-canvas)"
      ref={frame}
      sandbox="allow-scripts"
      src={`${artifact.basePath}${entry.path}`}
      title={title}
    />
  );
}

function isolatedSurfaceForPath(
  modules: ConsoleModuleMetadata[],
  path: string
) {
  for (const module of modules) {
    for (const surface of module.console ?? []) {
      if (
        surface.route === path &&
        surface.name &&
        surface.label &&
        surface.presentation?.kind === "isolated"
      ) {
        return {
          entryName: surface.presentation.entry,
          label: surface.label,
          moduleId: module.module_name ?? "",
          surface: surface.name,
        };
      }
    }
  }
  return null;
}

function ModuleState({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="m-6 rounded-xl border border-(--line) bg-(--bg-panel) p-6">
      <h1 className="text-base font-semibold">{title}</h1>
      {children ? (
        <p className="mt-2 text-sm text-(--fg-secondary)">{children}</p>
      ) : null}
    </section>
  );
}
