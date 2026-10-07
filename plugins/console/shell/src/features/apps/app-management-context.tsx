import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { useConsoleSession } from "../../app/console-session";
import { httpClient, isApiMode } from "../../lib/http-client";
import type {
  PluginCategory,
  PluginSelectionFilter,
} from "../plugins/plugin-categories";

export const pluginScopes = [
  { id: "application", label: "App plugins" },
  { id: "console-extensions", label: "Console extensions" },
  { id: "management-agent", label: "Management Agent" },
] as const;
export type PluginScope = (typeof pluginScopes)[number]["id"];
export type ManagedApp = {
  id: string;
  label: string;
  scope: PluginScope;
  pluginConfiguration: boolean;
  agentId: string | null;
  localBundleInstall: boolean;
};

export const demoApps: readonly ManagedApp[] = [
  {
    id: "development",
    label: "Development Agent",
    scope: "application",
    pluginConfiguration: true,
    agentId: "development",
    localBundleInstall: false,
  },
  {
    id: "support",
    label: "Support App",
    scope: "application",
    pluginConfiguration: true,
    agentId: null,
    localBundleInstall: false,
  },
  {
    id: "console-extensions",
    label: "Console",
    scope: "console-extensions",
    pluginConfiguration: false,
    agentId: null,
    localBundleInstall: false,
  },
  {
    id: "console",
    label: "Console management Agent",
    scope: "management-agent",
    pluginConfiguration: true,
    agentId: "console",
    localBundleInstall: true,
  },
];

export function parseAppCatalog(value: unknown): ManagedApp[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("apps" in value) ||
    !Array.isArray(value.apps)
  ) {
    throw new TypeError("App catalog is malformed");
  }
  const ids = new Set<string>();
  return value.apps.map((item: unknown) => {
    if (!item || typeof item !== "object") {
      throw new TypeError("App identity is malformed");
    }
    const app = item as ManagedApp;
    if (
      typeof app.id !== "string" ||
      !/^[a-z][a-z0-9._-]{0,63}$/u.test(app.id) ||
      ids.has(app.id) ||
      typeof app.label !== "string" ||
      !app.label.trim() ||
      !pluginScopes.some((scope) => scope.id === app.scope) ||
      typeof app.pluginConfiguration !== "boolean" ||
      typeof app.localBundleInstall !== "boolean" ||
      (app.agentId !== null &&
        (typeof app.agentId !== "string" || app.agentId !== app.id))
    ) {
      throw new TypeError("App identity is malformed");
    }
    ids.add(app.id);
    return app;
  });
}

async function listApps(signal: AbortSignal): Promise<readonly ManagedApp[]> {
  if (!isApiMode()) {
    return demoApps;
  }
  return parseAppCatalog(
    await httpClient.get("api/console/v1/apps", { signal }).json()
  );
}

const EMPTY_APPS: readonly ManagedApp[] = [];

type PluginListFilters = {
  category: PluginCategory;
  query: string;
  selection: PluginSelectionFilter;
};
const emptyFilters: PluginListFilters = {
  category: "all",
  query: "",
  selection: "all",
};

function useAppManagementState() {
  const [filtersByApp, setFiltersByApp] = useState<
    Record<string, PluginListFilters>
  >({});
  const updatePluginFilters = useCallback(
    (appId: string, patch: Partial<PluginListFilters>) => {
      setFiltersByApp((current) => ({
        ...current,
        [appId]: { ...(current[appId] ?? emptyFilters), ...patch },
      }));
    },
    []
  );
  const { administrator } = useConsoleSession();
  const catalog = useQuery({
    enabled: administrator,
    queryKey: ["app-management-catalog"],
    queryFn: ({ signal }) => listApps(signal),
    retry: false,
  });
  const [scope, setScope] = useState<PluginScope>("application");
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const apps = catalog.data ?? EMPTY_APPS;
  const selectedApp =
    apps.find((app) => app.scope === scope && app.id === preferredId) ??
    apps.find((app) => app.scope === scope);
  const selectApp = useCallback(
    (id: string) => {
      const app = apps.find((item) => item.id === id);
      if (app) {
        setPreferredId(id);
        setScope(app.scope);
      }
    },
    [apps]
  );
  const pluginFilters =
    (selectedApp && filtersByApp[selectedApp.id]) || emptyFilters;
  return useMemo(
    () => ({
      apps,
      selectedApp,
      selectApp,
      scope,
      setScope,
      catalog,
      pluginFilters,
      updatePluginFilters,
    }),
    [
      apps,
      selectedApp,
      selectApp,
      scope,
      catalog,
      pluginFilters,
      updatePluginFilters,
    ]
  );
}

const AppManagementContext = createContext<ReturnType<
  typeof useAppManagementState
> | null>(null);
export function AppManagementProvider({ children }: PropsWithChildren) {
  const value = useAppManagementState();
  return (
    <AppManagementContext.Provider value={value}>
      {children}
    </AppManagementContext.Provider>
  );
}
export function useAppManagement() {
  const value = useContext(AppManagementContext);
  if (!value) {
    throw new Error("AppManagementProvider is required");
  }
  return value;
}
