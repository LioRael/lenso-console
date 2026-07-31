import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Check,
  Copy,
  Database,
  KeyRound,
  Network,
  RefreshCw,
  Route,
  ScrollText,
  ShieldCheck,
  SquareTerminal,
  Store,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useState } from "react";

import { useConsoleCapabilities } from "../app/console-capabilities";
import {
  consolePackageInstallPlanFromMetadata,
  missingConsolePackagesFromMetadata,
} from "../app/console-module-metadata";
import { Button } from "../components/ui/button";
import {
  availableModulesPanelState,
  availableModulesQueryKey,
  availableModulesRows,
  fetchAvailableModules,
  fetchServiceModuleLifecycle,
  installAvailableModule,
  moduleRefreshInvalidationQueryKeys,
  serviceModuleLifecycleQueryKey,
  uninstallAvailableModule,
} from "../data/available-modules";
import { useBrowserUrlPopState } from "../hooks/use-browser-url-state";
import {
  useAdminActionInvocations,
  useRemoteProxyCalls,
} from "../hooks/use-runtime-queries";
import { cn } from "../lib/cn";
import {
  httpClient,
  isApiMode,
  runtimeConsoleDataSource,
} from "../lib/http-client";
import { AdminActionWorkbench } from "./admin-action-workbench";
import {
  flattenAdminActionInvocationPages,
  moduleActionEvidenceRows,
} from "./admin-actions-model";
import {
  type AvailableModuleDoctorCheck,
  type AvailableModuleDoctorCheckStatus,
  type AvailableModuleHandoffState,
  type AvailableModuleInstallStep,
  type AvailableModuleInstallStepKey,
  type AvailableModuleInstallStepStatus,
  type AvailableModuleRow,
  type ServiceModuleLifecycleModule,
  type ServiceModuleLifecycleResponse,
  availableModuleDoctorChecks,
  availableModuleHandoffState,
  availableModuleInstallSteps,
  availableModuleRowsFromResponse,
  serviceModuleLifecycleModuleFor,
} from "./available-modules-model";
import {
  type AdminModuleMetadata,
  type ConfigValueMetadata,
  type ModuleRegistryFilters,
  adminSurfaceMetadataRows,
  filterModuleRegistry,
  moduleActivationLabel,
  moduleActivationReasons,
  moduleConsoleSurfaceRows,
  moduleDataSurfaceRows,
  moduleDisabledByConfig,
  moduleDesiredEnabled,
  moduleEntrypointRows,
  moduleEnabledConfigKey,
  moduleErrorMessage,
  moduleGovernanceRows,
  moduleHttpRouteRows,
  moduleAdminActions,
  moduleIsLoaded,
  moduleLifecycleCheckRows,
  moduleLifecycleJobRows,
  latestModuleRefreshResult,
  moduleRegistryHandoffCommands,
  moduleRegistryHandoffCopyLabel,
  moduleManifestCheckGroups,
  moduleRegistrySummary,
  moduleRestartPending,
  moduleRunningEnabled,
  moduleRuntimeFunctionRows,
  moduleManifestChecks,
  moduleManifestHealth,
  moduleSourceLabel,
  remoteModuleReadiness,
  moduleStatusLabel,
  storyDisplayRows,
} from "./data-render-model";
import { pushOperationsUrl } from "./operations-url-model";
import {
  flattenRemoteProxyCallPages,
  remoteProxyCallsPath,
  summarizeRemoteProxyCalls,
} from "./remote-proxy-calls-model";

type ModulesResponse = {
  modules: AdminModuleMetadata[];
  refreshed_at: string | null;
  refresh_error: string | null;
  refresh_history: ModuleRefreshRecord[];
};

type ModuleRefreshRecord = {
  id: string;
  status: "success" | "error" | string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  module_count: number;
  error: string | null;
  module_results: ModuleRefreshModuleResult[];
};

type ModuleRefreshModuleResult = {
  module_name: string;
  source: "linked" | "remote" | string;
  status: "loaded" | "error" | string;
  duration_ms?: number | null;
  endpoint?: string | null;
  error?: string | null;
};

type ConfigWriteResponse = {
  applies_on_restart: boolean;
};

type ConfigValueListResponse = {
  data: ConfigValueMetadata[];
};

const modulesQueryKey = ["modules", "registry"] as const;
const configValuesQueryKey = ["config", "values"] as const;
const emptyModules: AdminModuleMetadata[] = [];
const emptyConfigValues: ConfigValueMetadata[] = [];
type ModulesPageMode = "registry" | "marketplace";

const modulesPageModeQueryParam = "panel";

function configPath(service: string, key: string) {
  return `admin/config/${encodeURIComponent(service)}/${encodeURIComponent(key)}`;
}

function applyConfigValueUpdate(
  response: ConfigValueListResponse | undefined,
  moduleName: string,
  desiredValue: boolean
): ConfigValueListResponse | undefined {
  if (!response) {
    return response;
  }
  const key = moduleEnabledConfigKey(moduleName);
  return {
    ...response,
    data: response.data.map((item) =>
      item.key === key
        ? {
            ...item,
            desired_value: desiredValue,
            pending_restart: true,
            value: desiredValue,
          }
        : item
    ),
  };
}

function applyModuleToggleUpdate(
  response: ModulesResponse | undefined,
  moduleName: string,
  desiredValue: boolean
): ModulesResponse | undefined {
  if (!response) {
    return response;
  }
  return {
    ...response,
    modules: response.modules.map((module) =>
      module.module_name === moduleName
        ? {
            ...module,
            error:
              module.source === "linked" && !desiredValue
                ? "module disabled by configuration"
                : module.error,
          }
        : module
    ),
  };
}

export function ModulesPage() {
  if (!isApiMode()) {
    return <ModulesPlaceholder reason="modules registry requires API mode" />;
  }
  return <ModulesContent />;
}

function ModulesContent() {
  const queryClient = useQueryClient();
  const {
    data: modulesData,
    isError: modulesIsError,
    isLoading: modulesIsLoading,
  } = useQuery({
    enabled: isApiMode(),
    queryKey: modulesQueryKey,
    queryFn: () => httpClient.get("admin/data/modules").json<ModulesResponse>(),
  });
  const { data: configValuesData } = useQuery({
    enabled: isApiMode(),
    queryKey: configValuesQueryKey,
    queryFn: () =>
      httpClient.get("admin/config/values").json<ConfigValueListResponse>(),
  });
  const {
    data: availableModulesData,
    isError: availableModulesIsError,
    isLoading: availableModulesIsLoading,
  } = useQuery({
    enabled: isApiMode(),
    queryKey: availableModulesQueryKey,
    queryFn: () => fetchAvailableModules(),
  });
  const { data: serviceLifecycleData } = useQuery({
    enabled: isApiMode(),
    queryKey: serviceModuleLifecycleQueryKey,
    queryFn: () => fetchServiceModuleLifecycle(),
  });
  const refreshMutation = useMutation({
    mutationFn: () =>
      httpClient.post("admin/data/modules/refresh").json<ModulesResponse>(),
    onSuccess: async () => {
      await Promise.all(
        moduleRefreshInvalidationQueryKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
    },
  });
  const installMutation = useMutation({
    mutationFn: (moduleName: string) => installAvailableModule({ moduleName }),
    onSuccess: async () => {
      await Promise.all(
        moduleRefreshInvalidationQueryKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
    },
  });
  const uninstallMutation = useMutation({
    mutationFn: (moduleName: string) =>
      uninstallAvailableModule({ moduleName }),
    onSuccess: async () => {
      await Promise.all(
        moduleRefreshInvalidationQueryKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
    },
  });
  const modules = modulesData?.modules ?? emptyModules;
  const configValues = configValuesData?.data ?? emptyConfigValues;
  const availableModuleRows = availableModulesData
    ? availableModuleRowsFromResponse(availableModulesData)
    : availableModulesRows();
  const availableModulePanelState = availableModulesPanelState({
    isError: availableModulesIsError,
    isLoading: availableModulesIsLoading,
    response: availableModulesData ?? null,
    rows: availableModuleRows,
  });
  const [panel, setPanel] = useState<ModulesPageMode>(() =>
    typeof window === "undefined"
      ? "registry"
      : initialModulesPageMode(window.location.search)
  );
  const [selectedModuleName, setSelectedModuleName] = useState<string | null>(
    typeof window === "undefined"
      ? null
      : initialSelectedModuleName(window.location.search)
  );
  const [filters, setFilters] = useState<ModuleRegistryFilters>({
    query: "",
    lint: "all",
    source: "all",
    status: "all",
  });
  const summary = moduleRegistrySummary(modules);
  const filteredModules = filterModuleRegistry(modules, filters);
  const selectedModule =
    panel === "registry"
      ? (filteredModules.find(
          (module) => module.module_name === selectedModuleName
        ) ??
        filteredModules[0] ??
        null)
      : null;
  const selectedServiceLifecycle = selectedModule
    ? serviceModuleLifecycleModuleFor(
        selectedModule.module_name,
        serviceLifecycleData ?? null
      )
    : null;

  useBrowserUrlPopState((search) => {
    setPanel(initialModulesPageMode(search.toString()));
    setSelectedModuleName(initialSelectedModuleName(search.toString()));
  });

  const updatePanel = (nextPanel: ModulesPageMode) => {
    setPanel(nextPanel);
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (nextPanel === "marketplace") {
      url.searchParams.set(modulesPageModeQueryParam, nextPanel);
    } else {
      url.searchParams.delete(modulesPageModeQueryParam);
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--background) text-(--foreground)">
      <header className="border-b border-(--border-subtle) bg-(--surface) px-2">
        <div className="flex min-h-10 items-center gap-2 overflow-hidden py-2">
          <Boxes className="text-(--accent)" size={14} />
          <h1 className="font-mono text-[13px] font-semibold">Modules</h1>
          <ModuleModeTabs mode={panel} onChange={updatePanel} />
          <span className="ml-auto truncate font-mono text-[10px] text-(--muted)">
            {modules.length} modules / {runtimeConsoleDataSource()} /{" "}
            {registrySnapshotLabel(modulesData?.refreshed_at ?? null)}
          </span>
          <Button
            aria-label="Refresh module registry"
            className="min-h-6 px-2"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
            title="Refresh module registry"
            type="button"
            variant="ghost"
          >
            <RefreshCw
              className={cn(refreshMutation.isPending && "animate-spin")}
              size={13}
            />
            Refresh
          </Button>
        </div>
        {modulesData?.refresh_error ? (
          <p className="mt-1 font-mono text-[10px] text-(--error)">
            Registry refresh error: {modulesData.refresh_error}
          </p>
        ) : refreshMutation.isError ? (
          <p className="mt-1 font-mono text-[10px] text-(--error)">
            Refresh failed: {String(refreshMutation.error.message)}
          </p>
        ) : null}
        <ModuleRefreshHistory history={modulesData?.refresh_history ?? []} />
      </header>

      <div className="grid min-h-0 grid-rows-[minmax(220px,40vh)_minmax(0,1fr)] overflow-hidden md:grid-cols-[280px_minmax(0,1fr)] md:grid-rows-none">
        <nav className="min-h-0 min-w-0 overflow-auto border-b border-(--border-subtle) p-2 font-mono text-[12px] md:border-r md:border-b-0">
          <ModuleRegistryControls
            filters={filters}
            onChange={setFilters}
            summary={summary}
          />
          {modulesIsLoading ? (
            <p className="px-2 py-1 text-(--muted)">Loading...</p>
          ) : modulesIsError ? (
            <p className="px-2 py-1 text-(--error)">Failed to load modules.</p>
          ) : modules.length === 0 ? (
            <p className="px-2 py-1 text-(--muted)">No modules registered.</p>
          ) : filteredModules.length === 0 ? (
            <p className="px-2 py-2 text-(--muted)">No modules match.</p>
          ) : (
            filteredModules.map((module) => {
              const selected =
                selectedModule?.module_name === module.module_name;
              const lintHealth = moduleManifestHealth(module);
              const moduleError = moduleErrorMessage(module);
              return (
                <button
                  className={cn(
                    "block w-full border-l-2 px-2 py-1 text-left",
                    selected ? "bg-(--bg-row-hover)" : "hover:bg-(--sidebar)",
                    lintHealth === "ok" && "border-l-(--success)",
                    lintHealth === "warning" && "border-l-(--warning)",
                    lintHealth === "error" && "border-l-(--error)",
                    moduleIsLoaded(module) ? null : "text-(--secondary)"
                  )}
                  key={module.module_name}
                  onClick={() => {
                    setPanel("registry");
                    setSelectedModuleName(module.module_name);
                  }}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {moduleIsLoaded(module) ? null : (
                      <TriangleAlert
                        className="shrink-0 text-(--error)"
                        size={12}
                      />
                    )}
                    <span className="truncate">{module.module_name}</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 border px-1 text-[9px] uppercase",
                        lintHealth === "ok" &&
                          "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
                        lintHealth === "warning" &&
                          "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
                        lintHealth === "error" &&
                          "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)"
                      )}
                    >
                      {lintHealth}
                    </span>
                  </span>
                  <span className="block truncate text-[10px] text-(--muted)">
                    {moduleSourceLabel(module)} / {moduleStatusLabel(module)} /{" "}
                    {moduleActivationLabel(module)}
                  </span>
                  {moduleError ? (
                    <span className="block truncate text-[10px] text-(--error)">
                      {moduleError}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </nav>

        <main className="min-h-0 min-w-0 overflow-auto p-3 font-mono text-[12px]">
          {panel === "marketplace" ? (
            <ModuleMarketplaceDetail
              configValues={configValues}
              installError={
                installMutation.error instanceof Error
                  ? installMutation.error.message
                  : null
              }
              installErrorModuleName={
                installMutation.isError
                  ? (installMutation.variables ?? null)
                  : null
              }
              uninstallError={
                uninstallMutation.error instanceof Error
                  ? uninstallMutation.error.message
                  : null
              }
              uninstallErrorModuleName={
                uninstallMutation.isError
                  ? (uninstallMutation.variables ?? null)
                  : null
              }
              installingModuleName={
                installMutation.isPending
                  ? (installMutation.variables ?? null)
                  : null
              }
              modules={modules}
              onInstall={(moduleName) => installMutation.mutate(moduleName)}
              onUninstall={(moduleName) => uninstallMutation.mutate(moduleName)}
              panelState={availableModulePanelState}
              rows={availableModuleRows}
              serviceLifecycle={serviceLifecycleData ?? null}
              uninstallingModuleName={
                uninstallMutation.isPending
                  ? (uninstallMutation.variables ?? null)
                  : null
              }
            />
          ) : selectedModule ? (
            <ModuleRegistryDetail
              configValues={configValues}
              history={modulesData?.refresh_history ?? []}
              module={selectedModule}
              serviceLifecycleModule={selectedServiceLifecycle}
            />
          ) : (
            <p className="text-(--muted)">
              Select a module or switch to marketplace.
            </p>
          )}
        </main>
      </div>
    </section>
  );
}

function ModuleModeTabs({
  mode,
  onChange,
}: {
  mode: ModulesPageMode;
  onChange: (mode: ModulesPageMode) => void;
}) {
  return (
    <nav
      aria-label="Modules panels"
      className="flex min-w-0 items-center gap-1 overflow-hidden rounded-[var(--radius-panel)] border border-(--border-subtle) bg-(--background) p-0.5"
    >
      {[
        { key: "registry", label: "Registry" },
        { key: "marketplace", label: "Marketplace" },
      ].map((item) => (
        <button
          className={cn(
            "h-6 shrink-0 rounded-[var(--radius-control)] px-2.5 text-[11px] font-medium transition-colors",
            mode === item.key
              ? "native-selection"
              : "text-(--muted) hover:bg-(--sidebar) hover:text-(--foreground)"
          )}
          key={item.key}
          onClick={() => onChange(item.key as ModulesPageMode)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function initialModulesPageMode(search: string): ModulesPageMode {
  const value = new URLSearchParams(search).get(modulesPageModeQueryParam);
  return value === "marketplace" ? "marketplace" : "registry";
}

function initialSelectedModuleName(search: string): string | null {
  return new URLSearchParams(search).get("module");
}

function ModulesPlaceholder({ reason }: { reason: string }) {
  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--background) text-(--foreground)">
      <header className="border-b border-(--border-subtle) bg-(--surface) px-3 py-2">
        <div className="flex items-center gap-2">
          <Boxes className="text-(--accent)" size={14} />
          <h1 className="font-mono text-[13px] font-semibold">Modules</h1>
        </div>
      </header>
      <div className="p-3 font-mono text-[12px] text-(--muted)">{reason}</div>
    </section>
  );
}

const availableModuleInstallStatusLabel: Record<
  AvailableModuleInstallStepStatus,
  string
> = {
  blocked: "hold",
  current: "now",
  done: "done",
  pending: "next",
  skipped: "skip",
};

const availableModuleInstallStepLabel: Record<
  AvailableModuleInstallStepKey,
  string
> = {
  add: "add",
  "apply-plan": "ext",
  "install-packages": "bundle",
  open: "open",
  restart: "boot",
};

const doctorStatusLabel: Record<AvailableModuleDoctorCheckStatus, string> = {
  fix: "fix",
  hold: "hold",
  ok: "ok",
  skip: "skip",
};

const doctorStatusTone: Record<AvailableModuleDoctorCheckStatus, string> = {
  fix: "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
  hold: "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)",
  ok: "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
  skip: "border-(--border-subtle) text-[color-mix(in_srgb,var(--muted)_65%,transparent)]",
};

function ModuleRefreshHistory({ history }: { history: ModuleRefreshRecord[] }) {
  if (history.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex min-w-0 gap-1 overflow-hidden font-mono text-[10px]">
      {history.slice(0, 3).map((record) => (
        <span
          className={cn(
            "min-w-0 truncate border px-1.5 py-0.5",
            record.status === "success" &&
              "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-(--success)",
            record.status === "error" &&
              "border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-(--error)"
          )}
          key={record.id}
          title={refreshRecordTitle(record)}
        >
          refresh {record.status} / {record.module_count} modules /{" "}
          {record.duration_ms}ms
        </span>
      ))}
    </div>
  );
}

function refreshRecordTitle(record: ModuleRefreshRecord) {
  if (record.error) {
    return record.error;
  }
  if (record.module_results.length === 0) {
    return record.completed_at;
  }
  return record.module_results
    .slice(0, 5)
    .map((result) =>
      [
        result.module_name,
        result.status,
        result.duration_ms === null || result.duration_ms === undefined
          ? null
          : `${result.duration_ms}ms`,
        result.error,
      ]
        .filter(Boolean)
        .join(" / ")
    )
    .join("\n");
}

function ModuleRegistryControls({
  filters,
  onChange,
  summary,
}: {
  filters: ModuleRegistryFilters;
  onChange: (filters: ModuleRegistryFilters) => void;
  summary: ReturnType<typeof moduleRegistrySummary>;
}) {
  return (
    <div className="mb-2 grid gap-2 border-b border-(--border-subtle) pb-2">
      <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
        <Counter label="total" value={summary.total} />
        <Counter label="linked" value={summary.linked} />
        <Counter label="remote" value={summary.remote} />
        <Counter label="lint warn" value={summary.lint_warning} />
        <Counter label="lint err" value={summary.lint_error} tone="error" />
      </div>
      <input
        aria-label="Search module registry"
        className="h-7 w-full border border-(--border-subtle) bg-(--background) px-2 text-[11px] text-(--foreground) outline-none placeholder:text-(--muted) focus:border-(--accent)"
        onChange={(event) =>
          onChange({ ...filters, query: event.currentTarget.value })
        }
        placeholder="search modules, routes, dependencies"
        type="search"
        value={filters.query}
      />
      <div className="grid gap-1">
        <SegmentedFilter
          label="source"
          onChange={(source) =>
            onChange({
              ...filters,
              source: source as ModuleRegistryFilters["source"],
            })
          }
          options={["all", "linked", "remote"]}
          value={filters.source}
        />
        <SegmentedFilter
          label="status"
          onChange={(status) =>
            onChange({
              ...filters,
              status: status as ModuleRegistryFilters["status"],
            })
          }
          options={["all", "loaded", "error"]}
          value={filters.status}
        />
        <SegmentedFilter
          label="lint"
          onChange={(lint) =>
            onChange({
              ...filters,
              lint: lint as ModuleRegistryFilters["lint"],
            })
          }
          options={["all", "ok", "warn", "err"]}
          value={lintFilterLabel(filters.lint)}
        />
      </div>
    </div>
  );
}

function SegmentedFilter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-1">
      <span className="truncate text-[9px] uppercase text-(--muted)">
        {label}
      </span>
      <div className="grid auto-cols-fr grid-flow-col gap-1">
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={cn(
              "h-6 min-w-0 truncate border border-(--border-subtle) px-1 text-[10px] text-(--muted)",
              value === option
                ? "border-(--line-strong) bg-(--bg-row-hover) text-(--foreground)"
                : "bg-(--background) hover:bg-(--sidebar)"
            )}
            key={option}
            onClick={() => onChange(expandLintFilter(option))}
            title={`${label}: ${option}`}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function lintFilterLabel(value: ModuleRegistryFilters["lint"]): string {
  if (value === "warning") {
    return "warn";
  }
  if (value === "error") {
    return "err";
  }
  return value;
}

function expandLintFilter(value: string): string {
  if (value === "warn") {
    return "warning";
  }
  if (value === "err") {
    return "error";
  }
  return value;
}

function Counter({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "error";
  value: number;
}) {
  return (
    <div className="border border-(--border-subtle) bg-(--surface) px-1 py-1">
      <div
        className={cn(
          "truncate text-[11px] text-(--secondary)",
          tone === "error" && value > 0 && "text-(--error)"
        )}
      >
        {value}
      </div>
      <div className="truncate text-[9px] text-(--muted)">{label}</div>
    </div>
  );
}

function ModuleMarketplaceDetail({
  configValues,
  installError,
  installErrorModuleName,
  installingModuleName,
  modules,
  onInstall,
  onUninstall,
  panelState,
  rows,
  serviceLifecycle,
  uninstallError,
  uninstallErrorModuleName,
  uninstallingModuleName,
}: {
  configValues: ConfigValueMetadata[];
  installError: string | null;
  installErrorModuleName: string | null;
  installingModuleName: string | null;
  modules: AdminModuleMetadata[];
  onInstall: (moduleName: string) => void;
  onUninstall: (moduleName: string) => void;
  panelState: ReturnType<typeof availableModulesPanelState>;
  rows: AvailableModuleRow[];
  serviceLifecycle?: ServiceModuleLifecycleResponse | null;
  uninstallError: string | null;
  uninstallErrorModuleName: string | null;
  uninstallingModuleName: string | null;
}) {
  const [copiedCommandKey, setCopiedCommandKey] = useState<string | null>(null);
  const copyCommand = (key: string, command: string) => {
    void window.navigator.clipboard?.writeText(command);
    setCopiedCommandKey(key);
    window.setTimeout(() => setCopiedCommandKey(null), 1200);
  };
  const installedCount = rows.filter(
    (row) =>
      row.installState?.moduleRegistered ||
      modules.some((module) => module.module_name === row.name)
  ).length;
  const readyCount = rows.filter((row) =>
    ["ready", "unknown"].includes(row.preflightStatus)
  ).length;
  const attentionCount = rows.filter(
    (row) =>
      row.preflightStatus !== "ready" && row.preflightStatus !== "unknown"
  ).length;
  const consoleHintCount = rows.reduce(
    (total, row) => total + row.consolePackageHintCount,
    0
  );

  return (
    <div className="grid gap-3">
      <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
        <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
          <Store className="text-(--info)" size={14} />
          <span>Marketplace</span>
          <span className="border border-[color-mix(in_srgb,var(--info)_35%,transparent)] px-1.5 py-0.5 text-[10px] text-(--info)">
            v0
          </span>
          <span className="ml-auto truncate border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
            {panelState.source}
          </span>
        </header>
        <div className="grid gap-2 p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Counter label="available" value={rows.length} />
            <Counter label="ready" value={readyCount} />
            <Counter label="installed" value={installedCount} />
            <Counter
              label="needs attention"
              tone={attentionCount > 0 ? "error" : "default"}
              value={attentionCount}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-(--border-subtle) bg-(--background) px-2 py-1.5 text-[10px]">
            <span className="truncate text-(--muted)">
              {panelState.message} / console package hints {consoleHintCount}
            </span>
            <span
              className={cn(
                "shrink-0 border px-1.5 py-0.5 uppercase",
                panelState.kind === "error"
                  ? "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)"
                  : "border-[color-mix(in_srgb,var(--info)_35%,transparent)] text-(--info)"
              )}
            >
              {panelState.label}
            </span>
          </div>
        </div>
      </section>

      {panelState.kind === "loading" ||
      panelState.kind === "error" ||
      panelState.kind === "empty" ? (
        <MarketplaceStateNotice panelState={panelState} />
      ) : (
        <section className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => {
            const handoffCommands = moduleRegistryHandoffCommands({
              manifestReference: row.manifestReference,
              moduleRelease: row.moduleRelease,
            });
            const [installCommand] = handoffCommands;
            const installedModule = modules.find(
              (module) => module.module_name === row.name
            );
            const missingConsolePackages = installedModule
              ? missingConsolePackagesFromMetadata([installedModule])
              : [];
            const consolePackageInstallPlan = installedModule
              ? consolePackageInstallPlanFromMetadata([installedModule])
              : [];
            const packageInstallNeeded = missingConsolePackages.length > 0;
            const restartPending = installedModule
              ? moduleRestartPending(installedModule, configValues)
              : false;
            const desiredEnabled = installedModule
              ? moduleDesiredEnabled(installedModule, configValues)
              : null;
            const runningEnabled = installedModule
              ? moduleRunningEnabled(installedModule)
              : null;
            const lifecycleModule = serviceModuleLifecycleModuleFor(
              row.name,
              serviceLifecycle ?? null
            );
            const handoff = availableModuleHandoffState({
              installed: installedModule
                ? {
                    moduleName: installedModule.module_name,
                    packageInstallNeeded,
                    restartPending,
                  }
                : null,
              installCommand: installCommand?.command ?? "",
              row,
            });
            const installSteps = availableModuleInstallSteps({
              commands: handoffCommands,
              evidence: {
                catalogSource: panelState.source,
                consoleInstallPlanCount: consolePackageInstallPlan.length,
                desiredEnabled,
                ...(row.installState ? { installState: row.installState } : {}),
                missingConsolePackageCount: missingConsolePackages.length,
                moduleRegistered: Boolean(installedModule),
                restartPending,
                runningEnabled,
              },
              handoff,
              row,
            });
            const doctorChecks = availableModuleDoctorChecks({
              commands: handoffCommands,
              missingConsolePackageCount: missingConsolePackages.length,
              moduleRegistered: Boolean(installedModule),
              restartPending,
              row,
              ...(serviceLifecycle === undefined ? {} : { serviceLifecycle }),
            });

            return (
              <MarketplaceModuleCard
                copiedCommandKey={copiedCommandKey}
                copyCommand={copyCommand}
                doctorChecks={doctorChecks}
                handoff={handoff}
                installError={
                  installError && installErrorModuleName === row.name
                    ? installError
                    : null
                }
                isInstalling={installingModuleName === row.name}
                isUninstalling={uninstallingModuleName === row.name}
                key={row.key}
                onInstall={onInstall}
                onUninstall={onUninstall}
                row={row}
                serviceLifecycleModule={lifecycleModule}
                steps={installSteps}
                uninstallError={
                  uninstallError && uninstallErrorModuleName === row.name
                    ? uninstallError
                    : null
                }
              />
            );
          })}
        </section>
      )}
    </div>
  );
}

function MarketplaceStateNotice({
  panelState,
}: {
  panelState: ReturnType<typeof availableModulesPanelState>;
}) {
  return (
    <section className="border border-(--border-subtle) bg-(--surface) p-3">
      <div className="grid gap-2 border border-(--border-subtle) bg-(--background) p-3">
        <div className="flex items-center gap-2">
          <TriangleAlert
            className={cn(
              panelState.kind === "error" ? "text-(--error)" : "text-(--muted)"
            )}
            size={14}
          />
          <span className="font-semibold text-(--foreground)">
            {panelState.message}
          </span>
          <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
            {panelState.label}
          </span>
        </div>
        <div className="border border-(--border-subtle) bg-(--surface) px-1.5 py-1 text-[10px] text-(--secondary)">
          {panelState.actionCommand}
        </div>
        <p className="text-[10px] text-(--muted)">{panelState.detail}</p>
      </div>
    </section>
  );
}

function MarketplaceModuleCard({
  copiedCommandKey,
  copyCommand,
  doctorChecks,
  handoff,
  installError,
  isInstalling,
  isUninstalling,
  onInstall,
  onUninstall,
  row,
  serviceLifecycleModule,
  steps,
  uninstallError,
}: {
  copiedCommandKey: string | null;
  copyCommand: (key: string, command: string) => void;
  doctorChecks: AvailableModuleDoctorCheck[];
  handoff: AvailableModuleHandoffState;
  installError: string | null;
  isInstalling: boolean;
  isUninstalling: boolean;
  onInstall: (moduleName: string) => void;
  onUninstall: (moduleName: string) => void;
  row: AvailableModuleRow;
  serviceLifecycleModule?: ServiceModuleLifecycleModule | null;
  steps: AvailableModuleInstallStep[];
  uninstallError: string | null;
}) {
  const currentStep = steps.find(
    (step) => step.status === "current" && (step.command || step.path)
  );
  const commandKey = `marketplace:${row.key}:${currentStep?.key ?? "state"}`;
  const releaseTitle = row.moduleRelease
    ? [
        row.moduleRelease.name ?? row.name,
        row.moduleRelease.source ?? row.source,
        row.moduleRelease.providerName,
        row.moduleRelease.manifestReference,
      ]
        .filter(Boolean)
        .join(" / ")
    : null;

  return (
    <article className="grid min-h-[320px] grid-rows-[auto_auto_1fr_auto] gap-2 border border-(--border-subtle) bg-(--surface) p-3">
      <header className="grid gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="grid size-9 shrink-0 place-items-center border border-(--border-subtle) bg-(--background)">
            <Store className="text-(--info)" size={17} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold text-(--foreground)">
              {row.name}
            </h2>
            <div className="truncate pt-0.5 text-[10px] text-(--muted)">
              {row.version} / {row.source} / {row.baseUrl}
            </div>
          </div>
          <span
            className={cn(
              "ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] uppercase",
              marketplaceHandoffTone[handoff.kind]
            )}
          >
            {handoff.label}
          </span>
        </div>
        <p className="line-clamp-2 min-h-8 text-[11px] text-(--secondary)">
          {row.summary}
        </p>
      </header>

      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
        <MarketplaceSmallMetric
          label="capabilities"
          value={row.capabilityCount}
        />
        <MarketplaceSmallMetric
          label="console"
          value={row.consolePackageHintCount}
        />
        <MarketplaceSmallMetric
          label="preflight"
          tone={availableModuleCanInstallVisual(row) ? "default" : "error"}
          value={row.preflightLabel}
        />
        <MarketplaceSmallMetric
          label="service"
          tone={
            serviceLifecycleModule && serviceLifecycleModule.status !== "ready"
              ? "error"
              : "default"
          }
          value={serviceLifecycleModule?.status ?? "n/a"}
        />
      </div>

      <div className="grid content-start gap-2">
        <MarketplaceInstallRail steps={steps} />
        <div
          className="truncate text-[10px] text-(--muted)"
          title={handoff.detail}
        >
          {handoff.detail}
        </div>
        {releaseTitle ? (
          <div
            className="truncate text-[10px] text-(--muted)"
            title={releaseTitle}
          >
            release {releaseTitle}
          </div>
        ) : null}
        {handoff.kind === "available" ? (
          <button
            className="border border-[color-mix(in_srgb,var(--info)_45%,transparent)] bg-(--background) px-2 py-1 text-left text-[10px] font-semibold text-(--info) hover:bg-(--sidebar) disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isInstalling}
            onClick={() => onInstall(row.name)}
            title={`Install ${row.name} from ${row.manifestReference}`}
            type="button"
          >
            {isInstalling ? "Installing..." : "Install"}
          </button>
        ) : null}
        {handoff.kind === "installed" ||
        handoff.kind === "restart_pending" ||
        handoff.kind === "package_install_needed" ? (
          <button
            className="border border-[color-mix(in_srgb,var(--warning)_55%,transparent)] bg-(--background) px-2 py-1 text-left text-[10px] font-semibold text-(--warning) hover:bg-(--sidebar) disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isUninstalling}
            onClick={() => onUninstall(row.name)}
            title={`Uninstall ${row.name} from local module configuration`}
            type="button"
          >
            {isUninstalling ? "Uninstalling..." : "Uninstall"}
          </button>
        ) : null}
        {installError ? (
          <div
            className="truncate border border-[color-mix(in_srgb,var(--error)_55%,transparent)] bg-(--background) px-1.5 py-1 text-[10px] text-(--error)"
            title={installError}
          >
            {installError}
          </div>
        ) : null}
        {uninstallError ? (
          <div
            className="truncate border border-[color-mix(in_srgb,var(--error)_55%,transparent)] bg-(--background) px-1.5 py-1 text-[10px] text-(--error)"
            title={uninstallError}
          >
            {uninstallError}
          </div>
        ) : null}
        {currentStep?.command ? (
          <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1">
            <code
              className="truncate border border-(--border-subtle) bg-(--background) px-1.5 py-1 text-[10px] text-(--secondary)"
              title={currentStep.command}
            >
              {currentStep.command}
            </code>
            <button
              aria-label={`${moduleRegistryHandoffCopyLabel(copiedCommandKey, commandKey)} ${currentStep.label} command`}
              className="grid size-6 place-items-center border border-(--border-subtle) bg-(--background) text-(--muted) hover:bg-(--sidebar) hover:text-(--foreground)"
              onClick={() => copyCommand(commandKey, currentStep.command ?? "")}
              title={moduleRegistryHandoffCopyLabel(
                copiedCommandKey,
                commandKey
              )}
              type="button"
            >
              {copiedCommandKey === commandKey ? (
                <Check size={11} />
              ) : (
                <Copy size={11} />
              )}
            </button>
          </div>
        ) : currentStep?.path ? (
          <button
            className="border border-(--border-subtle) bg-(--background) px-2 py-1 text-left text-[10px] text-(--secondary) hover:bg-(--sidebar) hover:text-(--foreground)"
            onClick={() => window.location.assign(currentStep.path ?? "")}
            title={currentStep.detail}
            type="button"
          >
            {currentStep.key === "open" ? "Open Module" : "Open Restart Step"}
          </button>
        ) : (
          <div
            className="truncate border border-(--border-subtle) bg-(--background) px-1.5 py-1 text-[10px] text-(--muted)"
            title={row.preflightFix ?? row.preflightReason}
          >
            {row.preflightFix ?? row.preflightReason}
          </div>
        )}
      </div>

      <div className="grid gap-1 border-t border-(--border-subtle) pt-2">
        <div className="grid grid-cols-3 gap-1">
          {doctorChecks.slice(0, 6).map((check) => (
            <span
              className={cn(
                "truncate border px-1 py-0.5 text-center text-[9px] uppercase",
                doctorStatusTone[check.status]
              )}
              key={check.key}
              title={check.command ?? check.detail}
            >
              {check.label} {doctorStatusLabel[check.status]}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function MarketplaceSmallMetric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "error";
  value: number | string;
}) {
  return (
    <div className="min-w-0 border border-(--border-subtle) bg-(--background) px-1 py-1">
      <div
        className={cn(
          "truncate text-[11px] text-(--secondary)",
          tone === "error" && "text-(--error)"
        )}
      >
        {value}
      </div>
      <div className="truncate text-[9px] text-(--muted)">{label}</div>
    </div>
  );
}

function MarketplaceInstallRail({
  steps,
}: {
  steps: AvailableModuleInstallStep[];
}) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {steps.map((step) => (
        <div className="min-w-0" key={step.key} title={step.detail}>
          <div
            className={cn(
              "h-1 border",
              step.status === "done" &&
                "border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-(--success)",
              step.status === "current" &&
                "border-[color-mix(in_srgb,var(--info)_45%,transparent)] bg-(--info)",
              step.status === "blocked" &&
                "border-[color-mix(in_srgb,var(--error)_55%,transparent)] bg-(--error)",
              step.status === "pending" &&
                "border-(--border-subtle) bg-(--background)",
              step.status === "skipped" &&
                "border-(--border-subtle) bg-[color-mix(in_srgb,var(--muted)_20%,transparent)]"
            )}
          />
          <div className="truncate pt-1 text-[9px] text-(--muted)">
            {availableModuleInstallStepLabel[step.key]}
          </div>
          <div className="truncate text-[8px] uppercase text-(--secondary)">
            {availableModuleInstallStatusLabel[step.status]}
          </div>
        </div>
      ))}
    </div>
  );
}

const marketplaceHandoffTone: Record<
  AvailableModuleHandoffState["kind"],
  string
> = {
  available:
    "border-[color-mix(in_srgb,var(--info)_45%,transparent)] text-(--info)",
  blocked:
    "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)",
  installed:
    "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
  package_install_needed:
    "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
  restart_pending:
    "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
};

function availableModuleCanInstallVisual(row: AvailableModuleRow): boolean {
  return row.preflightStatus === "ready" || row.preflightStatus === "unknown";
}

function registrySnapshotLabel(refreshedAt: string | null): string {
  if (!refreshedAt) {
    return "not refreshed";
  }
  const timestamp = new Date(refreshedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return refreshedAt;
  }
  return timestamp.toLocaleString();
}

function ModuleRegistryDetail({
  configValues,
  history,
  module,
  serviceLifecycleModule,
}: {
  configValues: ConfigValueMetadata[];
  history: ModuleRefreshRecord[];
  module: AdminModuleMetadata;
  serviceLifecycleModule?: ServiceModuleLifecycleModule | null;
}) {
  const availableCapabilities = useConsoleCapabilities();
  const routeRows = moduleHttpRouteRows(module);
  const runtimeRows = moduleRuntimeFunctionRows(module);
  const lifecycleJobRows = moduleLifecycleJobRows(module);
  const lifecycleCheckRows = moduleLifecycleCheckRows(module);
  const manifestChecks = moduleManifestChecks(module);
  const consoleRows = moduleConsoleSurfaceRows(module, {
    availableCapabilities,
  });
  const dataSurfaceRows = moduleDataSurfaceRows(module);
  const missingConsolePackages = missingConsolePackagesFromMetadata([module]);
  const consolePackageInstallPlan = consolePackageInstallPlanFromMetadata([
    module,
  ]);
  const restartPending = moduleRestartPending(module, configValues);
  const entrypointRows = moduleEntrypointRows(module, {
    hasMissingConsolePackages: missingConsolePackages.length > 0,
    restartPending,
  });
  const storyRows = storyDisplayRows(module);
  return (
    <div className="grid gap-3">
      <section className="border border-(--border-subtle) bg-(--surface)">
        <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
          <Boxes className="text-(--info)" size={14} />
          <span>{module.module_name}</span>
          <span className="ml-auto border border-(--border-subtle) px-2 py-0.5 text-[10px] text-(--secondary)">
            {moduleSourceLabel(module)} / {moduleStatusLabel(module)} /{" "}
            {moduleActivationLabel(module)}
          </span>
        </header>
        {moduleIsLoaded(module) ? (
          <MetadataRows rows={adminSurfaceMetadataRows(module)} />
        ) : (
          <p className="px-3 py-2 text-(--error)">
            {moduleErrorMessage(module)}
          </p>
        )}
      </section>

      <ModuleEntrypointsPanel rows={entrypointRows} />
      <ModuleDataSurfacesPanel rows={dataSurfaceRows} />
      <ModuleOperationsPanel
        configValues={configValues}
        history={history}
        module={module}
        {...(serviceLifecycleModule === undefined
          ? {}
          : { serviceLifecycleModule })}
      />
      <ModuleActionsPanel module={module} />
      <ModuleGovernancePanel module={module} />
      <ModuleDependenciesList dependencies={module.dependencies} />
      <ModuleCapabilitiesList capabilities={module.capabilities} />
      <ModuleConsoleSurfacesTable rows={consoleRows} />
      <MissingConsolePackagesTable
        installPlan={consolePackageInstallPlan}
        rows={missingConsolePackages}
      />
      <ModuleStoryDisplayTable rows={storyRows} />
      <ModuleLifecycleTable
        checkRows={lifecycleCheckRows}
        jobRows={lifecycleJobRows}
      />
      <ModuleRuntimeFunctionsTable rows={runtimeRows} />
      <ModuleManifestChecks checks={manifestChecks} />
      <ModuleHttpRoutesTable rows={routeRows} />
    </div>
  );
}

function ModuleEntrypointsPanel({
  rows,
}: {
  rows: ReturnType<typeof moduleEntrypointRows>;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <SquareTerminal className="text-(--accent)" size={14} />
        <span>Open Module</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <button
            className={cn(
              "min-w-0 border border-(--border-subtle) bg-(--background) px-2 py-2 text-left hover:bg-(--sidebar)",
              !row.path && "cursor-default"
            )}
            disabled={!row.path}
            key={row.key}
            onClick={() => openModuleEntrypoint(row.path)}
            title={row.detail}
            type="button"
          >
            <span className="block truncate text-[11px] text-(--foreground)">
              {row.label}
            </span>
            <span className="block truncate pt-1 text-[10px] text-(--muted)">
              {row.detail}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function openModuleEntrypoint(path: string) {
  if (!path) {
    return;
  }
  if (path.startsWith("#")) {
    document.querySelector(path)?.scrollIntoView({ block: "start" });
    return;
  }
  if (path.startsWith("/operations/")) {
    pushOperationsUrl(path);
    return;
  }
  window.location.assign(path);
}

function ModuleDataSurfacesPanel({
  rows,
}: {
  rows: ReturnType<typeof moduleDataSurfaceRows>;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Database className="text-(--info)" size={14} />
        <span>Data Surfaces</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="overflow-auto">
        <table className="w-full min-w-full table-fixed">
          <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
            <tr>
              <th className="px-3 py-1.5 text-left">entity</th>
              <th className="w-16 px-3 py-1.5 text-left sm:w-24">fields</th>
              <th className="hidden px-3 py-1.5 text-left sm:table-cell">
                capability
              </th>
              <th className="hidden w-28 px-3 py-1.5 text-left sm:table-cell">
                action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-(--border-subtle) text-[11px]"
                key={row.key}
              >
                <td className="min-w-0 px-3 py-1.5">
                  <div
                    className="truncate text-(--foreground)"
                    title={`${row.moduleName} / ${row.entityName}`}
                  >
                    {row.moduleName} / {row.entityLabel}
                  </div>
                  <div
                    className="truncate pt-0.5 text-[9px] text-(--muted)"
                    title={row.detail}
                  >
                    {row.detail}
                  </div>
                  <div
                    className="truncate pt-0.5 text-[9px] text-(--muted) sm:hidden"
                    title={row.capability}
                  >
                    {row.capability}
                  </div>
                  <button
                    className="mt-1 inline-flex h-6 items-center justify-center gap-1 border border-(--border-subtle) bg-(--elevated) px-2 text-[10px] text-(--muted) hover:text-(--foreground) sm:hidden"
                    onClick={() => window.location.assign(row.path)}
                    title={`${row.moduleName} / ${row.entityName}`}
                    type="button"
                  >
                    <Database size={11} />
                    Open Data
                  </button>
                </td>
                <td className="px-3 py-1.5 text-(--secondary)">
                  {row.fieldCount}
                </td>
                <td
                  className="hidden truncate px-3 py-1.5 text-(--muted) sm:table-cell"
                  title={row.capability}
                >
                  {row.capability}
                </td>
                <td className="hidden px-3 py-1.5 sm:table-cell">
                  <button
                    className="inline-flex h-6 items-center justify-center gap-1 border border-(--border-subtle) bg-(--elevated) px-2 text-[10px] text-(--muted) hover:text-(--foreground)"
                    onClick={() => window.location.assign(row.path)}
                    title={`${row.moduleName} / ${row.entityName}`}
                    type="button"
                  >
                    <Database size={11} />
                    Open Data
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MissingConsolePackagesTable({
  installPlan,
  rows,
}: {
  installPlan: ReturnType<typeof consolePackageInstallPlanFromMetadata>;
  rows: ReturnType<typeof missingConsolePackagesFromMetadata>;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <TriangleAlert className="text-(--warning)" size={14} />
        <span>Missing Console Packages</span>
        <span className="border border-[color-mix(in_srgb,var(--info)_35%,transparent)] px-1.5 py-0.5 text-[10px] text-(--info)">
          extension missing
        </span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="border-b border-(--border-subtle) px-3 py-2 text-[11px] text-(--secondary)">
        Reinstall the module to refresh{" "}
        <code>.lenso/console/extensions/registry.json</code>, then reload
        Runtime Console after the API and worker restart.
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[820px] table-fixed">
          <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
            <tr>
              <th className="px-3 py-1.5 text-left">package</th>
              <th className="w-28 px-3 py-1.5 text-left">extension</th>
              <th className="px-3 py-1.5 text-left">surface</th>
              <th className="px-3 py-1.5 text-left">route</th>
              <th className="px-3 py-1.5 text-left">capabilities</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const plan = installPlan.find((item) => item.key === row.key);
              return (
                <tr
                  className="border-t border-(--border-subtle) text-[11px]"
                  key={row.key}
                >
                  <td className="truncate px-3 py-1.5 text-(--foreground)">
                    {row.packageName} / {row.exportName}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className="inline-block max-w-full truncate border border-[color-mix(in_srgb,var(--info)_45%,transparent)] px-1.5 py-0.5 text-[10px] text-(--info)"
                      title={plan?.reason}
                    >
                      {plan?.status ?? "planned"}
                    </span>
                    <div
                      className="truncate pt-1 text-[9px] text-(--muted)"
                      title={
                        plan
                          ? `pnpm --dir apps/runtime-console add ${plan.packageName}`
                          : undefined
                      }
                    >
                      {plan
                        ? `pnpm --dir apps/runtime-console add ${plan.packageName}`
                        : "extension registry entry required"}
                    </div>
                  </td>
                  <td className="truncate px-3 py-1.5 text-(--secondary)">
                    {row.moduleName} / {row.surfaceLabel} / {row.surfaceName}
                  </td>
                  <td className="truncate px-3 py-1.5 text-(--muted)">
                    {row.route}
                  </td>
                  <td className="truncate px-3 py-1.5 text-(--muted)">
                    {row.requiredCapabilities.join(", ") || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModuleOperationsPanel({
  configValues,
  history,
  module,
  serviceLifecycleModule,
}: {
  configValues: ConfigValueMetadata[];
  history: ModuleRefreshRecord[];
  module: AdminModuleMetadata;
  serviceLifecycleModule?: ServiceModuleLifecycleModule | null;
}) {
  const queryClient = useQueryClient();
  const [moduleToggleMessage, setModuleToggleMessage] = useState<string | null>(
    null
  );
  const callsQuery = useRemoteProxyCalls({
    limit: 25,
    moduleName: module.module_name,
  });
  const calls = flattenRemoteProxyCallPages(callsQuery.data?.pages);
  const summary = summarizeRemoteProxyCalls(calls);
  const readiness = remoteModuleReadiness(module, calls);
  const { latestFailure } = readiness;
  const moduleSource = String(module.source);
  const isRemote = moduleSource === "remote" || moduleSource === "service";
  const diagnostics =
    module.source_diagnostics?.kind === "remote"
      ? module.source_diagnostics
      : null;
  const latestRefresh = latestModuleRefreshResult(module, history);
  const desiredEnabled = moduleDesiredEnabled(module, configValues);
  const runningEnabled = moduleRunningEnabled(module);
  const restartPending = moduleRestartPending(module, configValues);
  const disabledByConfig = moduleDisabledByConfig(module);
  const moduleSupportsToggle =
    moduleSource === "linked" ||
    moduleSource === "remote" ||
    moduleSource === "service";
  const moduleToggleTarget =
    moduleSupportsToggle &&
    (moduleIsLoaded(module) ||
      disabledByConfig ||
      restartPending ||
      isRemote) &&
    desiredEnabled !== null
      ? !desiredEnabled
      : null;
  const moduleToggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      httpClient
        .put(configPath("*", moduleEnabledConfigKey(module.module_name)), {
          json: { value: enabled },
        })
        .json<ConfigWriteResponse>(),
    onSuccess: async (response, enabled) => {
      setModuleToggleMessage(
        `${enabled ? "enable" : "disable"} saved${
          response.applies_on_restart ? "; restart required" : ""
        }`
      );
      queryClient.setQueryData(configValuesQueryKey, (current) =>
        applyConfigValueUpdate(
          current as ConfigValueListResponse | undefined,
          module.module_name,
          enabled
        )
      );
      queryClient.setQueryData(modulesQueryKey, (current) =>
        applyModuleToggleUpdate(
          current as ModulesResponse | undefined,
          module.module_name,
          enabled
        )
      );
      await queryClient.invalidateQueries({ queryKey: modulesQueryKey });
      await queryClient.invalidateQueries({ queryKey: configValuesQueryKey });
    },
    onError: (error: unknown) => setModuleToggleMessage(errorMessage(error)),
  });
  const operationStatus = restartPending
    ? "pending restart"
    : isRemote
      ? readiness.status
      : moduleIsLoaded(module)
        ? "ready"
        : "blocked";
  const serviceReadyCount =
    serviceLifecycleModule?.services.filter((service) => service.ready)
      .length ?? 0;
  const serviceTotal = serviceLifecycleModule?.services.length ?? 0;
  const serviceLifecycleRows = serviceLifecycleModule
    ? [
        {
          label: "service lifecycle",
          value: serviceLifecycleModule.status,
        },
        {
          label: "service configured",
          value: String(serviceLifecycleModule.configured),
        },
        {
          label: "service loaded",
          value: String(serviceLifecycleModule.loaded),
        },
        {
          label: "service ready",
          value:
            serviceTotal > 0 ? `${serviceReadyCount}/${serviceTotal}` : "-",
        },
        {
          label: "service manifest",
          value: serviceLifecycleModule.manifestStatus,
        },
        {
          label: "status endpoint",
          value: serviceLifecycleModule.statusUrl ?? "-",
        },
        {
          label: "service health",
          value: serviceLifecycleModule.serviceStatus?.state ?? "-",
        },
        {
          label: "health history",
          value: String(serviceLifecycleModule.healthHistory?.length ?? 0),
        },
        {
          label: "compatibility",
          value: serviceLifecycleModule.compatibility?.state ?? "-",
        },
        {
          label: "deployment",
          value: serviceLifecycleModule.deployment?.target ?? "-",
        },
        {
          label: "service fix",
          value: serviceLifecycleModule.fixes[0] ?? "-",
        },
      ]
    : [];

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Network className="text-(--accent)" size={14} />
        <span>Operations</span>
        <span
          className={cn(
            "ml-auto border px-1.5 py-0.5 text-[10px]",
            readiness.status === "ready" &&
              "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
            readiness.status === "degraded" &&
              "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
            readiness.status === "blocked" &&
              "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)",
            restartPending &&
              "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)"
          )}
        >
          {operationStatus}
        </span>
        {serviceLifecycleModule ? (
          <span
            className={cn(
              "border px-1.5 py-0.5 text-[10px]",
              serviceLifecycleModule.status === "ready"
                ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)"
                : "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)"
            )}
          >
            service {serviceLifecycleModule.status}
          </span>
        ) : null}
        {restartPending ? (
          <span className="border border-[color-mix(in_srgb,var(--warning)_55%,transparent)] px-1.5 py-0.5 text-[10px] text-(--warning)">
            pending restart
          </span>
        ) : null}
        {moduleToggleTarget === null ? null : (
          <Button
            className="min-h-6 px-2"
            disabled={moduleToggleMutation.isPending}
            onClick={() => moduleToggleMutation.mutate(moduleToggleTarget)}
            title={`${moduleToggleTarget ? "Enable" : "Disable"} ${module.module_name}`}
            type="button"
            variant="ghost"
          >
            <Zap size={12} />
            {moduleToggleTarget ? "Enable" : "Disable"}
          </Button>
        )}
        {isRemote ? (
          <button
            className="border border-(--border-subtle) bg-(--elevated) px-1.5 py-0.5 text-[10px] text-(--secondary) hover:text-(--foreground)"
            onClick={() =>
              pushOperationsUrl(
                remoteProxyCallsPath({ moduleName: module.module_name })
              )
            }
            type="button"
          >
            Remote Calls
          </button>
        ) : null}
      </header>
      {moduleToggleMessage ? (
        <p className="border-b border-(--border-subtle) px-3 py-2 text-[11px] text-(--warning)">
          {moduleToggleMessage}
        </p>
      ) : null}
      {isRemote && callsQuery.isError ? (
        <p className="border-b border-(--border-subtle) px-3 py-2 text-(--error)">
          Failed to load recent remote calls.
        </p>
      ) : isRemote && callsQuery.isLoading ? (
        <p className="border-b border-(--border-subtle) px-3 py-2 text-(--muted)">
          Loading recent remote calls...
        </p>
      ) : null}
      <MetadataRows
        rows={[
          { label: "readiness", value: operationStatus },
          {
            label: "running enabled",
            value: module.source === "linked" ? String(runningEnabled) : "-",
          },
          {
            label: "desired enabled",
            value: desiredEnabled === null ? "-" : String(desiredEnabled),
          },
          {
            label: "restart pending",
            value: restartPending ? "true" : "false",
          },
          ...serviceLifecycleRows,
          {
            label: "next step",
            value: restartPending
              ? "restart API and worker to apply the desired module state"
              : isRemote
                ? "module is loaded; use declared host proxy endpoints"
                : "linked module state is current",
          },
          {
            label: "reason",
            value: isRemote
              ? readiness.reasons.join(" / ")
              : "linked module state is applied on service restart",
          },
          {
            label: "latest refresh",
            value: latestRefresh
              ? [
                  latestRefresh.status,
                  latestRefresh.durationMs === null
                    ? null
                    : `${latestRefresh.durationMs}ms`,
                  latestRefresh.completedAt,
                ]
                  .filter(Boolean)
                  .join(" / ")
              : "-",
          },
          {
            label: "refresh endpoint",
            value: latestRefresh?.endpoint ?? "-",
          },
          {
            label: "refresh error",
            value: latestRefresh?.error ?? "-",
          },
          { label: "base url", value: diagnostics?.base_url ?? "-" },
          { label: "manifest url", value: diagnostics?.manifest_url ?? "-" },
          {
            label: "timeout",
            value: diagnostics ? `${diagnostics.timeout_ms}ms` : "-",
          },
          {
            label: "load duration",
            value:
              diagnostics?.load_duration_ms === null ||
              diagnostics?.load_duration_ms === undefined
                ? "-"
                : `${diagnostics.load_duration_ms}ms`,
          },
          {
            label: "auth configured",
            value: diagnostics ? String(diagnostics.auth_configured) : "-",
          },
          {
            label: "last checked",
            value: diagnostics?.last_checked_at ?? "-",
          },
          {
            label: "last load error",
            value: diagnostics?.last_load_error ?? "-",
          },
          { label: "manifest", value: moduleManifestHealth(module) },
          { label: "activation", value: moduleActivationLabel(module) },
          { label: "http routes", value: String(module.http_routes.length) },
          {
            label: "runtime functions",
            value: String(module.runtime?.functions.length ?? 0),
          },
          { label: "recent calls", value: String(summary.total) },
          { label: "failed calls", value: String(summary.failed) },
          {
            label: "avg duration",
            value: formatRemoteDuration(summary.avgDurationMs),
          },
          {
            label: "p95 duration",
            value: formatRemoteDuration(summary.p95DurationMs),
          },
          {
            label: "latest failure",
            value: latestFailure
              ? [
                  latestFailure.error_code ?? "unknown_error",
                  latestFailure.remote_status
                    ? `status ${latestFailure.remote_status}`
                    : null,
                  latestFailure.occurred_at,
                ]
                  .filter(Boolean)
                  .join(" / ")
              : "-",
          },
        ]}
      />
    </section>
  );
}

function ModuleActionsPanel({ module }: { module: AdminModuleMetadata }) {
  const actions = moduleAdminActions(module);
  if (!moduleIsLoaded(module) || actions.length === 0) {
    return null;
  }

  return (
    <LoadedModuleActionsPanel
      actions={actions}
      moduleName={module.module_name}
    />
  );
}

function LoadedModuleActionsPanel({
  actions,
  moduleName,
}: {
  actions: ReturnType<typeof moduleAdminActions>;
  moduleName: string;
}) {
  const invocationsQuery = useAdminActionInvocations({
    limit: 5,
    moduleName,
  });
  const evidenceRows = moduleActionEvidenceRows(
    flattenAdminActionInvocationPages(invocationsQuery.data?.pages)
  );

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Zap className="text-(--accent)" size={14} />
        <span>Module Actions</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {actions.length}
        </span>
      </header>
      <div className="p-2">
        <AdminActionWorkbench
          actions={actions}
          className="border-0 bg-transparent p-0"
          moduleName={moduleName}
          onActionSettled={async () => {
            await invocationsQuery.refetch();
          }}
        />
      </div>
      <ModuleActionEvidencePanel
        isError={invocationsQuery.isError}
        isFetching={invocationsQuery.isFetching}
        isLoading={invocationsQuery.isLoading}
        onRefresh={() => {
          void invocationsQuery.refetch();
        }}
        rows={evidenceRows}
      />
    </section>
  );
}

function ModuleActionEvidencePanel({
  isError,
  isFetching,
  isLoading,
  onRefresh,
  rows,
}: {
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  rows: ReturnType<typeof moduleActionEvidenceRows>;
}) {
  return (
    <div className="border-t border-(--border-subtle) p-2">
      <div className="flex min-w-0 items-center gap-2 px-1 pb-1.5">
        <span className="truncate text-[10px] font-semibold uppercase text-(--secondary)">
          Recent Evidence
        </span>
        <span className="border border-(--border-subtle) px-1.5 py-0.5 text-[9px] text-(--muted)">
          {rows.length}
        </span>
        <Button
          aria-label="Refresh action evidence"
          className="ml-auto min-h-6 px-2"
          disabled={isFetching}
          onClick={onRefresh}
          title="Refresh action evidence"
          type="button"
          variant="ghost"
        >
          <RefreshCw className={cn(isFetching && "animate-spin")} size={12} />
          Refresh
        </Button>
      </div>
      <div className="overflow-hidden border border-(--border-subtle) bg-(--background)">
        {isLoading ? (
          <p className="px-2 py-1.5 text-[11px] text-(--muted)">
            Loading action evidence...
          </p>
        ) : isError ? (
          <p className="px-2 py-1.5 text-[11px] text-(--error)">
            Failed to load action evidence.
          </p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-(--muted)">
            No action evidence yet.
          </p>
        ) : (
          <div className="grid">
            {rows.map((row) => (
              <div
                className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)_54px] items-center gap-2 border-t border-(--border-subtle) px-2 py-1.5 text-[11px] first:border-t-0 md:grid-cols-[64px_minmax(0,140px)_minmax(0,1fr)_104px_54px]"
                key={row.key}
                title={`${row.label} / ${row.correlationId}`}
              >
                <span
                  className={cn(
                    "truncate",
                    row.success ? "text-(--success)" : "text-(--error)"
                  )}
                >
                  {row.result}
                </span>
                <span className="truncate text-(--foreground)">
                  {row.actionName}
                </span>
                <span
                  className="hidden truncate text-(--muted) md:block"
                  title={row.summary}
                >
                  {row.summary}
                </span>
                <span
                  className="hidden truncate text-(--muted) md:block"
                  title={`${row.requestId} / ${row.occurredAt}`}
                >
                  {row.durationLabel} / {row.requestId}
                </span>
                <button
                  aria-label={`Open ${row.label} evidence`}
                  className="inline-flex h-6 items-center justify-center gap-1 border border-(--border-subtle) bg-(--elevated) px-1 text-[10px] text-(--muted) hover:text-(--foreground)"
                  onClick={() => pushOperationsUrl(row.operationsPath)}
                  title={row.operationsPath}
                  type="button"
                >
                  <Route size={11} />
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleGovernancePanel({ module }: { module: AdminModuleMetadata }) {
  const issues = module.governance?.capability_issues ?? [];
  const activationReasons = moduleActivationReasons(module);
  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <ShieldCheck className="text-(--accent)" size={14} />
        <span>Governance</span>
        <span
          className={cn(
            "ml-auto border px-1.5 py-0.5 text-[10px]",
            moduleActivationLabel(module) === "active" &&
              "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
            moduleActivationLabel(module) === "needs attention" &&
              "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
            moduleActivationLabel(module) === "blocked" &&
              "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)"
          )}
        >
          {moduleActivationLabel(module)}
        </span>
      </header>
      <MetadataRows rows={moduleGovernanceRows(module)} />
      {activationReasons.length > 0 ? (
        <div className="grid gap-1 border-t border-(--border-subtle) px-3 py-2">
          {activationReasons.slice(0, 4).map((reason) => (
            <div
              className="min-w-0 truncate text-[11px] text-(--warning)"
              key={reason}
              title={reason}
            >
              {reason}
            </div>
          ))}
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="grid gap-1 border-t border-(--border-subtle) px-3 py-2">
          {issues.slice(0, 4).map((issue) => (
            <div
              className="grid min-w-0 grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-2 text-[11px]"
              key={`${issue.subject}:${issue.capability}`}
              title={issue.suggestion}
            >
              <span className="truncate text-(--warning)">
                {issue.capability}
              </span>
              <span className="truncate text-(--muted)">{issue.subject}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MetadataRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-[150px_minmax(0,1fr)] border-b border-(--border-subtle)">
      {rows.map((row) => (
        <div className="contents" key={row.label}>
          <dt className="border-t border-(--border-subtle) bg-(--sidebar) px-3 py-1.5 text-(--muted)">
            {row.label}
          </dt>
          <dd className="min-w-0 truncate border-t border-(--border-subtle) px-3 py-1.5 text-(--secondary)">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ModuleCapabilitiesList({ capabilities }: { capabilities: string[] }) {
  if (capabilities.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No capabilities declared.
      </section>
    );
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <KeyRound className="text-(--warning)" size={14} />
        <span>Capabilities</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {capabilities.length}
        </span>
      </header>
      <div className="flex flex-wrap gap-1.5 p-2">
        {capabilities.map((capability) => (
          <span
            className="max-w-full truncate border border-(--border-subtle) bg-(--sidebar) px-2 py-1 text-[11px] text-(--secondary)"
            key={capability}
            title={capability}
          >
            {capability}
          </span>
        ))}
      </div>
    </section>
  );
}

function ModuleDependenciesList({ dependencies }: { dependencies: string[] }) {
  if (dependencies.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No dependencies declared.
      </section>
    );
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Network className="text-(--info)" size={14} />
        <span>Dependencies</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {dependencies.length}
        </span>
      </header>
      <div className="flex flex-wrap gap-1.5 p-2">
        {dependencies.map((dependency) => (
          <span
            className="max-w-full truncate border border-(--border-subtle) bg-(--sidebar) px-2 py-1 text-[11px] text-(--secondary)"
            key={dependency}
            title={dependency}
          >
            {dependency}
          </span>
        ))}
      </div>
    </section>
  );
}

function ModuleConsoleSurfacesTable({
  rows,
}: {
  rows: ReturnType<typeof moduleConsoleSurfaceRows>;
}) {
  if (rows.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No console surfaces declared.
      </section>
    );
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Boxes className="text-(--accent)" size={14} />
        <span>Console Surfaces</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] table-fixed">
          <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
            <tr>
              <th className="w-28 px-3 py-1.5 text-left">area</th>
              <th className="w-40 px-3 py-1.5 text-left">status</th>
              <th className="px-3 py-1.5 text-left">surface</th>
              <th className="px-3 py-1.5 text-left">route</th>
              <th className="px-3 py-1.5 text-left">package</th>
              <th className="px-3 py-1.5 text-left">capabilities</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-(--border-subtle) text-[11px]"
                key={row.key}
              >
                <td className="truncate px-3 py-1.5 text-(--foreground)">
                  {row.area}
                </td>
                <td className="min-w-0 px-3 py-1.5">
                  <span
                    className={cn(
                      "inline-block max-w-full truncate border px-1.5 py-0.5 text-[10px]",
                      row.availability === "available" &&
                        "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
                      row.availability === "missing_capability" &&
                        "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
                      row.availability === "unsupported_package" &&
                        "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)"
                    )}
                    title={row.availabilityReason}
                  >
                    {row.availabilityLabel}
                  </span>
                  <div
                    className="truncate pt-1 text-[9px] text-(--muted)"
                    title={row.availabilityReason}
                  >
                    {row.availabilityReason}
                  </div>
                </td>
                <td className="truncate px-3 py-1.5 text-(--secondary)">
                  {row.label} / {row.name}
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {row.route}
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {row.packageName} / {row.exportName}
                  <div className="truncate pt-1 text-[9px] text-(--muted)">
                    {row.packageRegistration}
                  </div>
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {row.capabilities}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModuleStoryDisplayTable({
  rows,
}: {
  rows: ReturnType<typeof storyDisplayRows>;
}) {
  if (rows.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No story display descriptors declared.
      </section>
    );
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <ScrollText className="text-(--info)" size={14} />
        <span>Story Display</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="overflow-auto">
        <table className="w-full min-w-[680px] table-fixed">
          <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
            <tr>
              <th className="px-3 py-1.5 text-left">source</th>
              <th className="px-3 py-1.5 text-left">display</th>
              <th className="px-3 py-1.5 text-left">story</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-(--border-subtle) text-[11px]"
                key={row.key}
              >
                <td className="truncate px-3 py-1.5 text-(--foreground)">
                  {row.source}
                </td>
                <td className="truncate px-3 py-1.5 text-(--secondary)">
                  {row.displayName}
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {row.storyTitle}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModuleRuntimeFunctionsTable({
  rows,
}: {
  rows: ReturnType<typeof moduleRuntimeFunctionRows>;
}) {
  const [copiedQueueKey, setCopiedQueueKey] = useState<string | null>(null);
  const copyQueueKey = (key: string, queueKey: string) => {
    void window.navigator.clipboard?.writeText(queueKey);
    setCopiedQueueKey(key);
    window.setTimeout(() => setCopiedQueueKey(null), 1200);
  };

  if (rows.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No runtime functions declared.
      </section>
    );
  }

  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Zap className="text-(--success)" size={14} />
        <span>Runtime Functions</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="border-b border-(--border-subtle) px-3 py-2 text-[11px] text-(--muted)">
        Remote functions run through the host worker. Open the queue to inspect
        pending and failed runs.
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] table-fixed">
          <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
            <tr>
              <th className="px-3 py-1.5 text-left">function</th>
              <th className="w-20 px-3 py-1.5 text-left">version</th>
              <th className="px-3 py-1.5 text-left">queue</th>
              <th className="px-3 py-1.5 text-left">worker queue</th>
              <th className="px-3 py-1.5 text-left">input schema</th>
              <th className="px-3 py-1.5 text-left">retry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-(--border-subtle) text-[11px]"
                key={row.key}
              >
                <td className="truncate px-3 py-1.5 text-(--foreground)">
                  {row.name}
                </td>
                <td className="px-3 py-1.5 text-(--secondary)">
                  {row.version}
                </td>
                <td className="truncate px-3 py-1.5 text-(--secondary)">
                  {row.queue}
                </td>
                <td className="px-3 py-1.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_24px_24px] items-center gap-1">
                    <button
                      className="min-w-0 truncate border border-(--border-subtle) bg-(--background) px-1.5 py-1 text-left font-mono text-[10px] text-(--secondary) hover:bg-(--sidebar) hover:text-(--foreground)"
                      onClick={() => pushOperationsUrl(row.queuePath)}
                      title={row.queueKey}
                      type="button"
                    >
                      {row.queueKey}
                    </button>
                    <button
                      aria-label={`${moduleRegistryHandoffCopyLabel(copiedQueueKey, row.key)} queue key`}
                      className="grid size-6 place-items-center border border-(--border-subtle) bg-(--background) text-(--muted) hover:bg-(--sidebar) hover:text-(--foreground)"
                      onClick={() => copyQueueKey(row.key, row.queueKey)}
                      title={moduleRegistryHandoffCopyLabel(
                        copiedQueueKey,
                        row.key
                      )}
                      type="button"
                    >
                      {copiedQueueKey === row.key ? (
                        <Check size={11} />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                    <button
                      aria-label="open queue"
                      className="grid size-6 place-items-center border border-(--border-subtle) bg-(--background) text-(--muted) hover:bg-(--sidebar) hover:text-(--foreground)"
                      onClick={() => pushOperationsUrl(row.queuePath)}
                      title="open queue"
                      type="button"
                    >
                      <SquareTerminal size={11} />
                    </button>
                  </div>
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {row.inputSchema}
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {row.retryPolicy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModuleLifecycleTable({
  checkRows,
  jobRows,
}: {
  checkRows: ReturnType<typeof moduleLifecycleCheckRows>;
  jobRows: ReturnType<typeof moduleLifecycleJobRows>;
}) {
  if (checkRows.length === 0 && jobRows.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No lifecycle activation declared.
      </section>
    );
  }

  return (
    <section
      className="min-w-0 border border-(--border-subtle) bg-(--surface)"
      id="activation-jobs"
    >
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Zap className="text-(--success)" size={14} />
        <span>Activation Jobs</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {jobRows.length} jobs / {checkRows.length} checks
        </span>
      </header>
      <div className="border-b border-(--border-subtle) px-3 py-2 text-[11px] text-(--muted)">
        Startup jobs are declared by the module and enqueued by the host worker
        during lifecycle activation.
      </div>
      {jobRows.length > 0 ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[920px] table-fixed">
            <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
              <tr>
                <th className="px-3 py-1.5 text-left">job</th>
                <th className="px-3 py-1.5 text-left">function</th>
                <th className="w-32 px-3 py-1.5 text-left">policy</th>
                <th className="w-24 px-3 py-1.5 text-left">required</th>
                <th className="px-3 py-1.5 text-left">input</th>
              </tr>
            </thead>
            <tbody>
              {jobRows.map((row) => (
                <tr
                  className="border-t border-(--border-subtle) text-[11px]"
                  key={row.key}
                >
                  <td className="truncate px-3 py-1.5 text-(--foreground)">
                    {row.name}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      className="min-w-0 truncate border border-(--border-subtle) bg-(--background) px-1.5 py-1 text-left text-[10px] text-(--secondary) hover:bg-(--sidebar) hover:text-(--foreground)"
                      onClick={() => pushOperationsUrl(row.functionPath)}
                      title={row.functionName}
                      type="button"
                    >
                      {row.functionName}
                    </button>
                  </td>
                  <td className="truncate px-3 py-1.5 text-(--secondary)">
                    {row.runPolicy}
                  </td>
                  <td className="truncate px-3 py-1.5 text-(--secondary)">
                    {row.required}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-(--muted)"
                    title={row.input}
                  >
                    {row.input}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {checkRows.length > 0 ? (
        <div className="border-t border-(--border-subtle) px-3 py-2">
          <div className="mb-1 text-[10px] uppercase text-(--muted)">
            startup checks
          </div>
          <div className="grid gap-1">
            {checkRows.map((row) => (
              <div
                className="grid min-w-0 grid-cols-[minmax(0,190px)_130px_minmax(0,1fr)_80px] gap-2 text-[11px]"
                key={row.key}
              >
                <span className="truncate text-(--foreground)" title={row.name}>
                  {row.name}
                </span>
                <span className="truncate text-(--secondary)">{row.kind}</span>
                <span className="truncate text-(--muted)" title={row.target}>
                  {row.target}
                </span>
                <span className="truncate text-(--muted)">{row.required}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ModuleManifestChecks({
  checks,
}: {
  checks: ReturnType<typeof moduleManifestChecks>;
}) {
  const groups = moduleManifestCheckGroups(checks);
  return (
    <section className="min-w-0 border border-(--border-subtle) bg-(--surface)">
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <TriangleAlert className="text-(--warning)" size={14} />
        <span>Manifest Lints</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {checks.length}
        </span>
      </header>
      {groups.length === 0 ? (
        <p className="px-3 py-2 text-(--muted)">No manifest lints returned.</p>
      ) : (
        <div className="divide-y divide-(--border-subtle)">
          {groups.map((group) => (
            <div className="grid gap-1 px-3 py-2" key={group.severity}>
              <div className="flex items-center gap-2 text-[10px] uppercase text-(--muted)">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0",
                    group.severity === "ok" && "bg-(--success)",
                    group.severity === "warning" && "bg-(--warning)",
                    group.severity === "error" && "bg-(--error)"
                  )}
                />
                <span>{group.severity}</span>
                <span className="ml-auto text-(--secondary)">
                  {group.checks.length}
                </span>
              </div>
              <div className="grid gap-1">
                {group.checks.map((check) => (
                  <ManifestLintRow check={check} key={check.key} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ManifestLintRow({
  check,
}: {
  check: ReturnType<typeof moduleManifestChecks>[number];
}) {
  return (
    <div className="grid min-w-0 grid-cols-[112px_minmax(0,170px)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]">
      <span
        className="truncate border border-(--border-subtle) bg-(--sidebar) px-1 text-[10px] text-(--secondary)"
        title={check.category}
      >
        {check.category}
      </span>
      <span className="truncate text-(--foreground)" title={check.subject}>
        {check.subject}
      </span>
      <span className="min-w-0 truncate text-(--muted)" title={check.message}>
        {check.message}
      </span>
      <span
        className="col-start-3 min-w-0 truncate text-[10px] text-(--secondary)"
        title={check.suggestion}
      >
        {check.suggestion}
      </span>
    </div>
  );
}

function ModuleHttpRoutesTable({
  rows,
}: {
  rows: ReturnType<typeof moduleHttpRouteRows>;
}) {
  const [copiedRouteKey, setCopiedRouteKey] = useState<string | null>(null);
  const copyRouteCommand = (key: string, command: string) => {
    void window.navigator.clipboard?.writeText(command);
    setCopiedRouteKey(key);
    window.setTimeout(() => setCopiedRouteKey(null), 1200);
  };

  if (rows.length === 0) {
    return (
      <section className="border border-(--border-subtle) bg-(--surface) px-3 py-2 text-(--muted)">
        No HTTP interfaces declared.
      </section>
    );
  }

  return (
    <section
      className="min-w-0 border border-(--border-subtle) bg-(--surface)"
      id="http-interfaces"
    >
      <header className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2 font-semibold">
        <Route className="text-(--accent)" size={14} />
        <span>HTTP Interfaces</span>
        <span className="ml-auto border border-(--border-subtle) px-1.5 py-0.5 text-[10px] text-(--secondary)">
          {rows.length}
        </span>
      </header>
      <div className="overflow-auto">
        <table className="w-full min-w-[960px] table-fixed">
          <thead className="bg-(--sidebar) text-[10px] uppercase tracking-wide text-(--muted)">
            <tr>
              <th className="w-16 px-3 py-1.5 text-left">method</th>
              <th className="px-3 py-1.5 text-left">path</th>
              <th className="px-3 py-1.5 text-left">host proxy</th>
              <th className="px-3 py-1.5 text-left">display</th>
              <th className="px-3 py-1.5 text-left">story</th>
              <th className="px-3 py-1.5 text-left">capability</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((route) => (
              <tr
                className="border-t border-(--border-subtle) text-[11px]"
                key={route.key}
              >
                <td className="px-3 py-1.5 text-(--accent)">{route.method}</td>
                <td className="truncate px-3 py-1.5 text-(--foreground)">
                  {route.path}
                </td>
                <td className="px-3 py-1.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1">
                    <code
                      className="truncate border border-(--border-subtle) bg-(--background) px-1.5 py-1 text-[10px] text-(--secondary)"
                      title={route.proxyCommand}
                    >
                      {route.proxyPath}
                    </code>
                    <button
                      aria-label={`${moduleRegistryHandoffCopyLabel(copiedRouteKey, route.key)} proxy command`}
                      className="grid size-6 place-items-center border border-(--border-subtle) bg-(--background) text-(--muted) hover:bg-(--sidebar) hover:text-(--foreground)"
                      onClick={() =>
                        copyRouteCommand(route.key, route.proxyCommand)
                      }
                      title={moduleRegistryHandoffCopyLabel(
                        copiedRouteKey,
                        route.key
                      )}
                      type="button"
                    >
                      {copiedRouteKey === route.key ? (
                        <Check size={11} />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  </div>
                </td>
                <td className="truncate px-3 py-1.5 text-(--secondary)">
                  {route.displayName}
                </td>
                <td className="truncate px-3 py-1.5 text-(--secondary)">
                  {route.storyTitle}
                </td>
                <td className="truncate px-3 py-1.5 text-(--muted)">
                  {route.capability}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatRemoteDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Module operation failed";
}
