import type {
  ConsoleManagedService,
  ConsoleNavigationMetadata,
  ConsoleSystemConnection,
} from "@lenso/console-ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  useConsoleArtifacts,
  type ConsoleArtifactReceipt,
} from "../../app/console-artifact-query";
import { useConsoleSystemConnection } from "../../app/console-system-connection-api";
import { useConsoleManagedServices } from "../../app/console-system-registry-api";
import {
  useRuntimeSummary,
  type RuntimeSummaryItem,
} from "../../hooks/use-runtime-queries";
import { httpClient, isApiMode } from "../../lib/http-client";
import type { DeliveryConsoleProjection } from "../../pages/delivery-console";
import type { RuntimeServiceRow } from "../runtime/runtime-service-model";

export type ConsoleDataMode = "live" | "demo";

export type HomeEvidenceItem = {
  detail: string;
  id: string;
  occurredAt: string;
  title: string;
  tone: "success" | "warning" | "error" | "neutral";
};

export function useSystemInventory() {
  const query = useConsoleSystemConnection();
  const rows = useMemo(() => {
    if (!isApiMode()) {
      return demoSystemInventoryRows;
    }
    return systemInventoryRows(query.data);
  }, [query.data]);
  return { ...query, mode: dataMode(), rows };
}

export type ModuleRegistrySurfaceRow = {
  area: string;
  defaultFromArea?: boolean;
  exportName?: string;
  label: string;
  navigation?: ConsoleNavigationMetadata;
  packageName?: string;
  presentation: string;
  requiredCapabilities?: readonly string[];
  route: string;
};

export type ModuleRegistryRow = {
  capabilities: readonly string[];
  error: string | null;
  id: string;
  name: string;
  source: string;
  state: "loaded" | "error";
  surfaces: ModuleRegistrySurfaceRow[];
};

export const demoModuleRegistryRows = [
  {
    capabilities: [],
    error: null,
    id: "platform-story",
    name: "platform-story",
    source: "first_party",
    state: "loaded",
    surfaces: [
      {
        area: "runtime",
        defaultFromArea: true,
        label: "Stories",
        navigation: {
          order: -10,
          workspace: { id: "system", label: "System" },
        },
        presentation: "esm",
        requiredCapabilities: ["runtime.stories.read"],
        route: "/stories",
      },
    ],
  },
  {
    capabilities: [],
    error: null,
    id: "lenso/system-registry",
    name: "lenso/system-registry",
    source: "first_party",
    state: "loaded",
    surfaces: [
      {
        area: "operations",
        label: "Managed Services",
        navigation: {
          group: { id: "operations", label: "Operations" },
          order: 30,
          workspace: { id: "system", label: "System" },
        },
        presentation: "esm",
        requiredCapabilities: ["console.system-registry.read"],
        route: "/services",
      },
    ],
  },
] satisfies ModuleRegistryRow[];

export function useModuleRegistry() {
  const query = useConsoleArtifacts();
  const rows = useMemo<ModuleRegistryRow[]>(() => {
    if (!isApiMode()) {
      return demoModuleRegistryRows;
    }
    return query.data?.artifacts.map(moduleRegistryRowFromArtifact) ?? [];
  }, [query.data]);
  return { ...query, mode: dataMode(), rows };
}

export function useRuntimeServices() {
  const query = useConsoleManagedServices();
  const rows = useMemo<RuntimeServiceRow[]>(
    () => query.data?.map(runtimeServiceRowFromManagedService) ?? [],
    [query.data]
  );
  return { ...query, mode: dataMode(), rows };
}

export function useChangeEvidence() {
  const summary = useRuntimeSummary();
  const rows = useMemo(
    () => (summary.data?.recentActivity ?? []).map(changeRowFromRuntime),
    [summary.data]
  );
  return { ...summary, mode: dataMode(), rows };
}

export function useDeliveryEvidence() {
  const current = useQuery({
    enabled: isApiMode(),
    queryKey: ["runtime", "delivery", "current"],
    queryFn: () =>
      httpClient
        .get("admin/runtime/deliveries/current")
        .json<DeliveryConsoleProjection>(),
    retry: false,
  });
  return { current, mode: dataMode() };
}

export function useHomeEvidence() {
  const summary = useRuntimeSummary();
  const changes = useChangeEvidence();
  const evidence = useMemo(() => {
    const runtime =
      summary.data?.recentActivity.map((item) => ({
        detail: item.id,
        id: item.id,
        occurredAt: item.createdAt,
        title: item.name,
        tone: runtimeTone(item.status),
      })) ?? [];
    const actions = changes.rows.map((item) => ({
      detail: `${item.module} · ${item.state}`,
      id: item.id,
      occurredAt: item.occurredAt,
      title: item.name,
      tone: item.tone,
    }));
    return mergeHomeEvidence(actions, runtime);
  }, [changes.rows, summary.data]);
  return { changes, evidence, mode: dataMode(), summary };
}

export function mergeHomeEvidence(
  actions: HomeEvidenceItem[],
  runtime: HomeEvidenceItem[]
): HomeEvidenceItem[] {
  const actionIds = new Set(actions.map((item) => item.id));
  return [...actions, ...runtime.filter((item) => !actionIds.has(item.id))]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 8);
}

function moduleRegistryRowFromArtifact(
  artifact: ConsoleArtifactReceipt
): ModuleRegistryRow {
  const surfaces = artifact.manifest.surfaces.map((surface) => ({
    area: surface.area,
    label: surface.label,
    presentation: "esm",
    route: surface.path,
    ...(surface.navigation ? { navigation: surface.navigation } : {}),
    ...(surface.requiredCapabilities
      ? { requiredCapabilities: surface.requiredCapabilities }
      : {}),
  }));
  const id = artifact.moduleId;
  return {
    capabilities: [
      ...new Set(
        surfaces.flatMap((surface) => surface.requiredCapabilities ?? [])
      ),
    ],
    error: null,
    id,
    name: titleCase(id),
    source: "runtime_bundle",
    state: "loaded",
    surfaces,
  };
}

type SystemInventoryRow = {
  capabilities: readonly string[];
  dependencies: readonly string[];
  id: string;
  kind: string;
  name: string;
  owner: string;
  state: string;
};

function systemInventoryRows(
  connection: ConsoleSystemConnection | null | undefined
): SystemInventoryRow[] {
  if (!connection) {
    return [];
  }
  const moduleRows = connection.modules.map((module) => ({
    id: `module.${module.moduleId}`,
    kind: "Module",
    name: module.moduleId,
    owner: module.serviceId ?? "Linked Module",
    state: module.status === "connected" ? "Healthy" : "Degraded",
    capabilities: module.surfaceApiGrant?.operationIds ?? [],
    dependencies: [] as string[],
  }));
  const serviceRows = connection.services.map((service) => ({
    id: `service.${service.serviceId}`,
    kind: "Service",
    name: service.serviceId,
    owner: service.servicePrincipal,
    state: service.status === "connected" ? "Healthy" : "Degraded",
    capabilities: [] as string[],
    dependencies: [] as string[],
  }));
  return [...moduleRows, ...serviceRows];
}

function runtimeServiceRowFromManagedService(
  service: ConsoleManagedService
): RuntimeServiceRow {
  return {
    errorRate: null,
    id: service.serviceId,
    p95Ms: null,
    providerName: service.presentation?.owner ?? service.serviceId,
    region: service.presentation?.environment ?? "unknown",
    replicas: null,
    serviceId: service.serviceId,
    state: service.connectionState,
    timeline: [],
    version: service.presentation?.version ?? "—",
  };
}

const demoSystemInventoryRows: SystemInventoryRow[] = [
  {
    capabilities: ["support.ticket.read"],
    dependencies: ["billing.invoice.read"],
    id: "module.support-ticket",
    kind: "Module",
    name: "support-ticket",
    owner: "support",
    state: "Healthy",
  },
  {
    capabilities: ["billing.invoice.read"],
    dependencies: [],
    id: "module.invoice",
    kind: "Module",
    name: "invoice",
    owner: "billing",
    state: "Healthy",
  },
  {
    capabilities: ["support-ticket"],
    dependencies: [],
    id: "service.support",
    kind: "Service",
    name: "support",
    owner: "local",
    state: "Healthy",
  },
  {
    capabilities: ["invoice"],
    dependencies: [],
    id: "service.billing",
    kind: "Service",
    name: "billing",
    owner: "kubernetes",
    state: "Healthy",
  },
] as const;

function changeRowFromRuntime(item: RuntimeSummaryItem) {
  return {
    detail: item.lastError ?? `${item.type} runtime work`,
    id: item.id,
    module: item.type,
    name: item.name,
    occurredAt: item.createdAt,
    state:
      item.status === "failed" || item.status === "dead"
        ? "Needs attention"
        : "Verified",
    tone:
      item.status === "failed" || item.status === "dead"
        ? ("error" as const)
        : ("success" as const),
  };
}

function dataMode(): ConsoleDataMode {
  return isApiMode() ? "live" : "demo";
}

function runtimeTone(status: string) {
  if (status === "completed" || status === "published") {
    return "success" as const;
  }
  if (status === "failed" || status === "dead") {
    return "error" as const;
  }
  return "neutral" as const;
}

function titleCase(value: string) {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
