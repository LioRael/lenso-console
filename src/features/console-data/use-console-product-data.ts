import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ConsoleModuleMetadata } from "../../app/console-module-resolver";
import { buildTimeConsoleModuleMetadata } from "../../app/console-modules";
import {
  fetchServiceModuleLifecycle,
  fetchServiceSystem,
  fetchServiceSystemReleaseTrain,
  serviceModuleLifecycleQueryKey,
  serviceSystemQueryKey,
  serviceSystemReleaseTrainQueryKey,
} from "../../data/available-modules";
import type { AdminActionInvocationItem } from "../../hooks/runtime-api-types";
import {
  useAdminActionInvocations,
  useRuntimeSummary,
} from "../../hooks/use-runtime-queries";
import { httpClient, isApiMode } from "../../lib/http-client";
import type { AdminModuleMetadata } from "../../pages/data-render-model";
import type { DeliveryConsoleProjection } from "../../pages/delivery-console";
import { serviceCenterRows } from "../../pages/services-model";

export type ConsoleDataMode = "live" | "demo";

export type HomeEvidenceItem = {
  detail: string;
  id: string;
  occurredAt: string;
  title: string;
  tone: "success" | "warning" | "error" | "neutral";
};

export function useSystemInventory() {
  const query = useQuery({
    queryKey: serviceSystemQueryKey,
    queryFn: () => fetchServiceSystem(),
  });
  const rows = useMemo(() => {
    const { data } = query;
    if (!data) {
      return [];
    }
    const moduleRows = data.modules.map((module) => ({
      id: `module.${module.name}`,
      kind: "Module",
      name: module.name,
      owner: module.owner || "Unassigned",
      state: data.status === "ready" ? "Healthy" : "Degraded",
      capabilities: module.capabilities,
      dependencies: module.dependencies,
    }));
    const serviceRows = data.services.map((service) => ({
      id: `service.${service.name}`,
      kind: "Service",
      name: service.name,
      owner: service.target,
      state: data.status === "ready" ? "Healthy" : "Degraded",
      capabilities: service.modules,
      dependencies: [] as string[],
    }));
    return [...moduleRows, ...serviceRows];
  }, [query.data]);
  return { ...query, mode: dataMode(), rows };
}

type ModulesResponse = {
  modules: AdminModuleMetadata[];
  refreshed_at: string | null;
};

export function useModuleRegistry() {
  const query = useQuery({
    enabled: isApiMode(),
    queryKey: ["modules", "registry"],
    queryFn: () => httpClient.get("admin/data/modules").json<ModulesResponse>(),
  });
  const rows = useMemo(
    () =>
      query.data
        ? query.data.modules.map((module) => ({
            capabilities: module.capabilities,
            error: module.error,
            id: module.module_name,
            name: titleCase(module.module_name),
            source: module.source,
            state: module.status,
            surfaces: module.console.map((surface) => ({
              area: surface.area,
              label: surface.label,
              route: surface.route,
            })),
          }))
        : buildTimeConsoleModuleMetadata.map(moduleMetadataRow),
    [query.data]
  );
  return { ...query, mode: dataMode(), rows };
}

export function useRuntimeServices() {
  const query = useQuery({
    queryKey: serviceModuleLifecycleQueryKey,
    queryFn: () => fetchServiceModuleLifecycle(),
  });
  const rows = useMemo(
    () => serviceCenterRows(query.data ?? { modules: [] }),
    [query.data]
  );
  return { ...query, mode: dataMode(), rows };
}

export function useChangeEvidence() {
  const invocations = useAdminActionInvocations({ limit: 20 });
  const rows = useMemo(
    () =>
      (invocations.data?.pages.flatMap((page) => page.data) ?? []).map(
        changeRowFromInvocation
      ),
    [invocations.data]
  );
  return { ...invocations, mode: dataMode(), rows };
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
  const releaseTrain = useQuery({
    queryKey: serviceSystemReleaseTrainQueryKey,
    queryFn: () => fetchServiceSystemReleaseTrain(),
  });
  return { current, mode: dataMode(), releaseTrain };
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

function moduleMetadataRow(module: ConsoleModuleMetadata) {
  const surfaces = (module.console ?? []).map((surface) => ({
    area: surface.area ?? "runtime",
    label: surface.label ?? surface.name ?? "Surface",
    route: surface.route ?? "-",
  }));
  const id = module.module_name ?? "unknown";
  return {
    capabilities: surfaces.flatMap(() => [] as string[]),
    error: module.error ?? null,
    id,
    name: titleCase(id),
    source: "linked",
    state: module.status ?? "loaded",
    surfaces,
  };
}

function changeRowFromInvocation(item: AdminActionInvocationItem) {
  return {
    detail:
      item.input_summary ?? item.result_summary ?? `${item.duration_ms} ms`,
    id: item.id,
    module: item.module_name,
    name: item.label || item.action_name,
    occurredAt: item.occurred_at,
    state: item.success ? "Verified" : "Needs attention",
    tone: item.success ? ("success" as const) : ("error" as const),
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
