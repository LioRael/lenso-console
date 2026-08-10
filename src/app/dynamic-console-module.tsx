import {
  ConsoleModuleProvider,
  SurfaceRoot,
  type ConsoleUiSurface,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { isApiMode } from "../lib/http-client";
import { useConsoleAdminContext } from "./console-admin-context";
import {
  getConsoleArtifactQuarantine,
  getConsoleArtifactQuarantines,
  quarantineConsoleArtifact,
  subscribeConsoleArtifactQuarantine,
} from "./console-artifact-quarantine";
import { useConsoleArtifacts } from "./console-artifact-query";
import { useConsoleCapabilities } from "./console-capabilities";
import { createConsoleModuleClient } from "./console-module-client";
import { loadConsoleUiModule } from "./console-module-runtime";
import { consoleRoutes, findConsoleRoute } from "./console-modules";
import { consolePathFromLocation } from "./console-router-config";
import { statusStyles } from "./console-status-styles";
import { useConsoleSystemConnection } from "./console-system-connection-api";
import { connectionModuleForArtifact } from "./console-system-connection-model";
import { useConsoleManagedServices } from "./console-system-registry-api";
import {
  createManagedServiceContext,
  managedServiceContextKey,
} from "./managed-service-context";
import { useSelectedManagedServiceId } from "./managed-service-selection";

export function DynamicConsoleModulePage() {
  const locationPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const path = consolePathFromLocation(locationPath);
  const navigate = useNavigate();
  const capabilities = useConsoleCapabilities();
  const apiMode = isApiMode();
  const artifacts = useConsoleArtifacts();
  const adminContext = useConsoleAdminContext();
  const managedServices = useConsoleManagedServices();
  const systemConnection = useConsoleSystemConnection();
  const selectedManagedServiceId = useSelectedManagedServiceId();
  const queryClient = useQueryClient();
  const quarantines = useSyncExternalStore(
    subscribeConsoleArtifactQuarantine,
    getConsoleArtifactQuarantines,
    getConsoleArtifactQuarantines
  );
  const quarantineKeys = useMemo(
    () => new Set(quarantines.map((quarantine) => quarantine.key)),
    [quarantines]
  );
  const localRoute = useMemo(
    () => findConsoleRoute(path, consoleRoutes),
    [path]
  );
  const selection = useMemo(() => {
    for (const artifact of artifacts.data?.artifacts ?? []) {
      if (
        quarantineKeys.has(`${artifact.moduleId}:${artifact.artifactDigest}`)
      ) {
        continue;
      }
      const surface = artifact.manifest.surfaces.find(
        (candidate) => candidate.path === path
      );
      if (surface) {
        const connectionModule = connectionModuleForArtifact(
          systemConnection.data,
          artifact
        );
        if (systemConnection.data !== undefined && !connectionModule) {
          continue;
        }
        return { artifact, connectionModule, surface };
      }
    }
    return null;
  }, [artifacts.data?.artifacts, path, quarantineKeys, systemConnection.data]);
  const artifact = selection?.artifact;
  const connectedModule = selection?.connectionModule;
  const selectedManagedService = useMemo(() => {
    const ready = managedServices.data?.filter(
      (service) =>
        service.enrollmentState === "active" &&
        service.connectionState === "ready" &&
        service.enrollmentExpiresAtUnixMs > Date.now()
    );
    if (connectedModule?.serviceId) {
      return ready?.find(
        (service) => service.serviceId === connectedModule.serviceId
      );
    }
    return (
      ready?.find(
        (service) => service.serviceId === selectedManagedServiceId
      ) ?? ready?.[0]
    );
  }, [
    connectedModule?.serviceId,
    managedServices.data,
    selectedManagedServiceId,
  ]);
  const managedServiceContext = useMemo(
    () =>
      artifact && selectedManagedService && adminContext.data
        ? createManagedServiceContext({
            actor: adminContext.data.actor,
            callerModuleId: artifact.moduleId,
            capabilities,
            service: selectedManagedService,
          })
        : null,
    [adminContext.data, artifact, capabilities, selectedManagedService]
  );
  const contextKey = managedServiceContext
    ? managedServiceContextKey(managedServiceContext)
    : null;
  const previousContextKey = useRef<string | null>(null);
  useEffect(() => {
    if (
      previousContextKey.current !== null &&
      previousContextKey.current !== contextKey
    ) {
      queryClient.removeQueries({
        queryKey: ["managed-service", previousContextKey.current],
      });
      queryClient.removeQueries({ queryKey: ["console", "module-ui"] });
      queryClient.removeQueries({ queryKey: ["console", "artifacts"] });
    }
    previousContextKey.current = contextKey;
  }, [contextKey, queryClient]);
  const moduleQuery = useQuery({
    enabled: Boolean(
      artifact &&
      selection &&
      systemConnection.data &&
      connectedModule?.status === "connected"
    ),
    queryKey: [
      "console",
      "module-ui",
      contextKey,
      artifact?.moduleId,
      artifact?.artifactDigest,
    ],
    queryFn: () =>
      loadConsoleUiModule(artifact!, { origin: window.location.origin }),
  });
  useEffect(() => {
    if (artifact && moduleQuery.isError) {
      quarantineConsoleArtifact(artifact, moduleQuery.error);
    }
  }, [artifact, moduleQuery.error, moduleQuery.isError]);

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

  if (localRoute?.path === "/access") {
    const LocalSurface = localRoute.component;
    return (
      <SurfaceRoot moduleId={localRoute.moduleId} surfaceId={localRoute.path}>
        <LocalSurface />
      </SurfaceRoot>
    );
  }

  if (systemConnection.isPending) {
    return <ModuleState title="Loading System Connection" />;
  }
  if (systemConnection.isError) {
    return <ModuleState title="System Connection is unavailable" />;
  }
  if (!systemConnection.data) {
    return (
      <ModuleState title="Connect a System before opening Module Surfaces">
        Console only composes surfaces from an exact System topology and
        Management Binding.
      </ModuleState>
    );
  }

  if (artifacts.isPending) {
    return <ModuleState title="Loading Module UI" />;
  }
  if (artifacts.isError) {
    return <ModuleState title="Console UI artifact receipt is unavailable" />;
  }
  if (!selection) {
    return (
      <ModuleState title="Module release is not connected to this System">
        The requested Console UI artifact is not part of the connected Module
        release.
      </ModuleState>
    );
  }
  if (connectedModule?.status !== "connected") {
    return (
      <ModuleState title={`Module ${connectedModule?.status ?? "unmanaged"}`}>
        {connectedModule?.reason ??
          "This Module does not have a connected workload in the System."}
      </ModuleState>
    );
  }
  const selectedArtifact = selection.artifact;
  if (moduleQuery.isPending) {
    return <ModuleState title="Loading Module UI artifact" />;
  }
  if (moduleQuery.isError || !moduleQuery.data) {
    const quarantine = artifact
      ? getConsoleArtifactQuarantine(artifact)
      : undefined;
    return (
      <ModuleState
        title={
          quarantine
            ? "Module UI artifact quarantined"
            : "Module UI could not be loaded"
        }
      >
        {quarantine
          ? `${quarantine.evidence.join("; ")} ${quarantine.nextAction}`
          : undefined}
      </ModuleState>
    );
  }
  if (!managedServiceContext) {
    return (
      <ModuleState title="Managed Service Context is unavailable">
        Select an enrolled, compatible Managed Service before opening this
        Module Surface.
      </ModuleState>
    );
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
    managedServiceContext,
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
