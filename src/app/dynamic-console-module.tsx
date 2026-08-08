import {
  ConsoleModuleProvider,
  SurfaceRoot,
  type ConsoleUiSurface,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { isApiMode } from "../lib/http-client";
import { useConsoleArtifacts } from "./console-artifact-query";
import { useConsoleCapabilities } from "./console-capabilities";
import { createConsoleModuleClient } from "./console-module-client";
import { loadConsoleUiModule } from "./console-module-runtime";
import { consoleRoutes, findConsoleRoute } from "./console-modules";
import { consolePathFromLocation } from "./console-router-config";
import { statusStyles } from "./console-status-styles";

export function DynamicConsoleModulePage() {
  const locationPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const path = consolePathFromLocation(locationPath);
  const navigate = useNavigate();
  const capabilities = useConsoleCapabilities();
  const apiMode = isApiMode();
  const artifacts = useConsoleArtifacts();
  const localRoute = useMemo(
    () => (apiMode ? undefined : findConsoleRoute(path, consoleRoutes)),
    [apiMode, path]
  );
  const selection = useMemo(() => {
    for (const artifact of artifacts.data?.artifacts ?? []) {
      const surface = artifact.manifest.surfaces.find(
        (candidate) => candidate.path === path
      );
      if (surface) {
        return { artifact, surface };
      }
    }
    return null;
  }, [artifacts.data?.artifacts, path]);
  const artifact = selection?.artifact;
  const moduleQuery = useQuery({
    enabled: Boolean(artifact && selection),
    queryKey: [
      "console",
      "module-ui",
      artifact?.moduleId,
      artifact?.artifactDigest,
    ],
    queryFn: () =>
      loadConsoleUiModule(artifact!, { origin: window.location.origin }),
  });

  if (!apiMode) {
    if (!localRoute) {
      return <ModuleState title="Console page not found" />;
    }
    const LocalSurface = localRoute.component;
    return (
      <SurfaceRoot moduleId={localRoute.moduleId} surfaceId={localRoute.path}>
        <LocalSurface />
      </SurfaceRoot>
    );
  }

  if (artifacts.isPending) {
    return <ModuleState title="Loading Module UI" />;
  }
  if (artifacts.isError) {
    return <ModuleState title="Console UI artifact receipt is unavailable" />;
  }
  if (!selection) {
    return <ModuleState title="Console page not found" />;
  }
  const selectedArtifact = selection.artifact;
  if (moduleQuery.isPending) {
    return <ModuleState title="Loading Module UI artifact" />;
  }
  if (moduleQuery.isError || !moduleQuery.data) {
    return <ModuleState title="Module UI could not be loaded" />;
  }
  const surface = findSurface(moduleQuery.data.surfaces, selection.surface.id);
  if (!surface) {
    return <ModuleState title="Module UI surface is not declared" />;
  }
  const client = createConsoleModuleClient({
    capabilities,
    moduleId: selectedArtifact.moduleId,
    moduleReleaseDigest: selectedArtifact.moduleReleaseDigest,
    navigate: (target, options) => {
      void navigate({
        to: target,
        ...(options?.replace === undefined ? {} : { replace: options.replace }),
      });
    },
    requiredCapabilities:
      selection.surface.requiredCapabilities ?? surface.requiredCapabilities,
    uiArtifactDigest: selectedArtifact.artifactDigest,
  });
  return (
    <ConsoleModuleProvider client={client}>
      <SurfaceRoot moduleId={selectedArtifact.moduleId} surfaceId={surface.id}>
        <surface.component />
      </SurfaceRoot>
    </ConsoleModuleProvider>
  );
}

function findSurface(surfaces: readonly ConsoleUiSurface[], id: string) {
  return surfaces.find((surface) => surface.id === id);
}

function ModuleState({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  return (
    <section {...stylex.props(statusStyles.moduleState)}>
      <h1 {...stylex.props(statusStyles.moduleStateTitle)}>{title}</h1>
      {children ? (
        <p {...stylex.props(statusStyles.moduleStateDescription)}>{children}</p>
      ) : null}
    </section>
  );
}
