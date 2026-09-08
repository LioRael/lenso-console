import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
import { Tabs } from "@lenso/ui/tabs";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  useAppManagement,
  pluginScopes,
  type ManagedApp,
} from "../apps/app-management-context";
import { SettingsPageHeader } from "../settings/settings-page-header";
import { settingsPageStyles as pageStyles } from "../settings/settings-page.stylex";
import { usePluginAgentWorkbench } from "./plugin-agent-workbench-context";
import { applyPluginWorkbenchRequest } from "./plugin-agent-workbench-request";
import {
  categoriesForPlugin,
  matchesPluginFilters,
  pluginCategories,
  type PluginCategory,
  type PluginSelectionFilter,
} from "./plugin-categories";
import { pluginDisplayName } from "./plugin-display-name";
import { PluginDraftNavigationGuard } from "./plugin-draft-navigation-guard";
import { PluginFilterSelect } from "./plugin-filter-select";
import {
  pluginOriginLabel,
  pluginSelectionIdentityMatches,
  pluginStatusPresentation,
} from "./plugin-runtime-state";
import { PluginStatus } from "./plugin-status";
import { InstallPluginDialog } from "./plugin-workbench-dialogs";
import { pluginKey, type PluginWorkbenchItem } from "./plugin-workbench-model";
import {
  usePluginConfigurationDraftStore,
  usePluginMutation,
  usePluginWorkbench,
} from "./use-plugin-workbench";

const EMPTY_PLUGIN_ITEMS: readonly PluginWorkbenchItem[] = [];

const styles = stylex.create({
  workbench: {
    maxWidth: 760,
    width: "calc(100% - 48px)",
    display: "grid",
    gap: 24,
  },
  breadcrumbParent: {
    display: "inline-flex",
    overflow: "hidden",
    minWidth: 0,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    width: "100%",
    flexWrap: "wrap",
    paddingBlock: 8,
  },
  tabs: { minWidth: 0, flex: "1 1 540px", overflowX: "auto", paddingBlock: 2 },
  tab: {
    borderRadius: 999,
    minHeight: 30,
    paddingInline: 12,
    flexShrink: 0,
    backgroundColor: tokens.colorSurfaceCanvas,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: tokens.colorBorderTertiary,
  },
  tabActive: {
    backgroundColor: tokens.colorSurfaceSelected,
    borderColor: "transparent",
    color: tokens.colorContentPrimary,
  },
  count: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    marginInlineStart: 6,
    fontVariantNumeric: "tabular-nums",
  },
  controls: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  search: { width: 200, minWidth: 0, maxWidth: "100%" },
  columns: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    fontSize: 11,
    fontWeight: 500,
    gap: tokens.space4,
    gridTemplateColumns: "minmax(180px, 1fr) 130px 88px",
    minHeight: 34,
    paddingInline: 14,
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 88px",
    },
  },
  header: {
    height: "auto",
    minWidth: 0,
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: tokens.space3,
  },
  headerSubrow: {
    height: "auto",
    minHeight: 46,
    paddingInline: 12,
  },
  identity: { display: "grid", gap: 2, minWidth: 0 },
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  packageColumn: {
    "@media (max-width: 720px)": {
      display: "none",
    },
  },
  page: {
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: 0,
    height: "100%",
    minHeight: 0,
    width: "100%",
  },
  primary: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  row: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": tokens.colorSurfaceInteractiveHover,
    },
    borderRadius: tokens.radiusControl,
    borderStyle: "none",
    color: tokens.colorContentSecondary,
    cursor: "pointer",
    display: "grid",
    fontFamily: tokens.fontSans,
    fontSize: 12,
    gap: tokens.space4,
    gridTemplateColumns: "minmax(172px, 1fr) 130px 88px",
    marginInline: 8,
    minHeight: 54,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -2,
    paddingInline: 6,
    textAlign: "left",
    textDecoration: "none",
    width: "calc(100% - 16px)",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 88px",
    },
  },
  secondary: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  state: {
    alignContent: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    gap: tokens.space3,
    justifyItems: "start",
    minHeight: 160,
    padding: 24,
  },
  stateDescription: {
    fontSize: 12,
    lineHeight: "18px",
    margin: 0,
    maxWidth: 420,
  },
  stateTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    margin: 0,
  },
  tableRegion: {
    minWidth: 0,
    overflow: "auto",
  },
  inventoryList: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: tokens.colorBorderTertiary,
    borderRadius: 10,
    backgroundColor: "var(--color-surface-panel)",
    paddingBlock: 8,
  },
  visuallyHidden: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});

export function PluginWorkbenchPage() {
  const { apps, selectApp, selectedApp, scope, setScope, catalog } =
    useAppManagement();
  const { request } = usePluginAgentWorkbench();
  const [category, setCategory] = useState<PluginCategory>("all");
  useEffect(() => {
    if (
      request &&
      request.agentId !== selectedApp?.id &&
      apps.some((agent) => agent.id === request.agentId)
    ) {
      selectApp(request.agentId);
    }
  }, [apps, request, selectApp, selectedApp?.id]);
  return (
    <Tabs.Root
      value={scope}
      onValueChange={(value) => setScope(value as typeof scope)}
      data-page="plugin-workbench"
      xstyle={styles.page}
    >
      <PageHeader.Root
        aria-label="Plugin navigation"
        variant="team"
        xstyle={styles.header}
      >
        <PageHeader.Row>
          <Breadcrumb.Root>
            <Breadcrumb.List>
              <Breadcrumb.Item>
                <Breadcrumb.Page>Plugins</Breadcrumb.Page>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>
        </PageHeader.Row>
        <PageHeader.TabsRow xstyle={styles.headerSubrow}>
          <Tabs.List aria-label="Plugin scope" xstyle={styles.tabs}>
            {pluginScopes.map((item) => (
              <Tabs.Tab
                key={item.id}
                value={item.id}
                xstyle={[styles.tab, scope === item.id && styles.tabActive]}
              >
                {item.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </PageHeader.TabsRow>
      </PageHeader.Root>
      <Tabs.Panel value={scope} xstyle={styles.tableRegion}>
        {catalog.isPending ? (
          <WorkbenchState
            title="Loading Apps"
            description="Reading management targets."
          />
        ) : catalog.isError ? (
          <WorkbenchState
            title="Apps unavailable"
            description="The App management catalog could not be loaded."
            action={
              <Button
                onClick={() => {
                  void catalog.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : selectedApp ? (
          <AppPluginWorkbench
            key={selectedApp.id}
            selectedApp={selectedApp}
            category={category}
            onCategoryChange={setCategory}
          />
        ) : (
          <WorkbenchState
            title="No Apps connected"
            description="Connect a Lenso App to manage its plugins here."
          />
        )}
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function AppPluginWorkbench({
  category,
  onCategoryChange,
  selectedApp,
}: {
  selectedApp: ManagedApp;
  category: PluginCategory;
  onCategoryChange: (category: PluginCategory) => void;
}) {
  const { apps, selectApp, scope } = useAppManagement();
  const targets = apps.filter((app) => app.scope === scope);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<PluginSelectionFilter>("all");
  const configurationAvailable = selectedApp.pluginConfiguration;
  const workbench = usePluginWorkbench(selectedApp.id, configurationAvailable);
  const plugins = workbench.data?.items ?? EMPTY_PLUGIN_ITEMS;
  const visiblePlugins = plugins.filter((plugin) =>
    matchesPluginFilters(plugin, category, query, selection)
  );
  const inventory = workbench.data?.inventory;
  const navigate = useNavigate();
  const { completeRequest, request } = usePluginAgentWorkbench();
  const appliedRequestId = useRef(0);
  const configurationDraftStore = usePluginConfigurationDraftStore();
  useEffect(() => {
    if (!workbench.data) {
      return;
    }
    configurationDraftStore.retainKeys(
      new Set(workbench.data.items.map(pluginKey))
    );
  }, [configurationDraftStore, workbench.data]);
  useEffect(() => {
    if (
      !request ||
      request.id === appliedRequestId.current ||
      request.agentId !== selectedApp.id ||
      !workbench.data
    ) {
      return;
    }
    const result = applyPluginWorkbenchRequest({
      draftStore: configurationDraftStore,
      items: workbench.data.items,
      managementRevision: workbench.data.management.revision,
      request,
    });
    if (!result) {
      return;
    }
    appliedRequestId.current = request.id;
    const requestedPlugin = workbench.data.items.find(
      (plugin) => pluginKey(plugin) === result.selectedKey
    );
    if (requestedPlugin) {
      completeRequest(request.id);
      navigate({
        params: {
          agentId: selectedApp.id,
          instanceKey: requestedPlugin.instanceKey,
          packageId: requestedPlugin.packageId,
        },
        to: "/plugins/$agentId/$packageId/$instanceKey",
      });
    }
  }, [
    configurationDraftStore,
    completeRequest,
    navigate,
    request,
    selectedApp.id,
    workbench.data,
  ]);
  const mutation = usePluginMutation(selectedApp.id, inventory?.streamId);
  return (
    <div {...stylex.props(pageStyles.column, styles.workbench)}>
      <SettingsPageHeader
        title="Plugins"
        description={`Integrations and capabilities installed for ${selectedApp.label}.`}
      />
      <PluginDraftNavigationGuard store={configurationDraftStore} />
      {configurationAvailable ? (
        <div
          aria-label="Plugin filters"
          {...stylex.props(styles.header, styles.headerSubrow)}
        >
          <div {...stylex.props(styles.toolbar)}>
            {targets.length > 1 ? (
              <PluginFilterSelect
                label="Manage App"
                value={selectedApp.id}
                onValueChange={selectApp}
                options={targets.map((app) => ({
                  value: app.id,
                  label: app.label,
                }))}
              />
            ) : (
              <span {...stylex.props(styles.primary)}>{selectedApp.label}</span>
            )}
            <PluginFilterSelect
              label="Plugin category"
              value={category}
              onValueChange={onCategoryChange}
              options={pluginCategories.map((item) => ({
                value: item.id,
                label: `${item.label}${workbench.data ? ` (${item.id === "all" ? plugins.length : plugins.filter((plugin) => categoriesForPlugin(plugin).includes(item.id)).length})` : ""}`,
              }))}
            />
            <div {...stylex.props(styles.controls)}>
              <TextField.Root size="compact" xstyle={styles.search}>
                <TextField.Control
                  type="search"
                  aria-label="Search plugins"
                  placeholder="Search plugins…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </TextField.Root>
              <PluginFilterSelect<PluginSelectionFilter>
                label="Plugin selection"
                value={selection}
                onValueChange={setSelection}
                options={[
                  { value: "all", label: "All states" },
                  { value: "enabled", label: "Enabled" },
                  { value: "disabled", label: "Disabled" },
                ]}
              />
              <PageHeader.Actions>
                <div {...stylex.props(styles.headerActions)}>
                  {selectedApp.localBundleInstall ? (
                    <InstallPluginDialog
                      disabled={
                        !workbench.authoringEnabled ||
                        !selectedApp.localBundleInstall
                      }
                      error={
                        mutation.variables?.type === "install" &&
                        mutation.error instanceof Error
                          ? mutation.error
                          : null
                      }
                      isPending={mutation.isPending}
                      onInstall={async (bundlePath) => {
                        if (!inventory) {
                          throw new TypeError(
                            "The Console cannot install a Plugin before Host inventory is available"
                          );
                        }
                        await mutation.mutateAsync({
                          bundlePath,
                          expectedStreamId: inventory.streamId,
                          type: "install",
                        });
                      }}
                    />
                  ) : null}
                </div>
              </PageHeader.Actions>
            </div>
          </div>
        </div>
      ) : null}
      <h1 id="plugins-heading" {...stylex.props(styles.visuallyHidden)}>
        Plugins
      </h1>
      <div {...stylex.props(styles.tableRegion)}>
        {configurationAvailable === false ? (
          <WorkbenchState
            title="Plugin management unavailable"
            description={
              selectedApp.scope === "console-extensions"
                ? "Console has no connected extension management authority. Management Agent plugins are managed separately."
                : `${selectedApp.label} does not expose Plugin configuration management.`
            }
          />
        ) : workbench.isPending && !workbench.isError ? (
          <WorkbenchState
            description="Reading the active App configuration."
            title="Loading Plugins"
          />
        ) : workbench.configurationAvailable === false ? (
          <WorkbenchState
            description={
              selectedApp.scope === "console-extensions"
                ? "Console has no connected extension management authority. Management Agent plugins are managed separately."
                : `${selectedApp.label} does not expose Plugin configuration management.`
            }
            title="Plugin configuration unavailable"
          />
        ) : workbench.isError ? (
          <WorkbenchState
            action={
              <Button
                onClick={() => {
                  void workbench.refetch();
                }}
                size="compact"
                variant="secondary"
              >
                Try again
              </Button>
            }
            description={
              workbench.error instanceof Error
                ? workbench.error.message
                : "The active App configuration could not be loaded."
            }
            title="Plugins unavailable"
          />
        ) : !inventory || !workbench.data ? (
          <WorkbenchState
            description="Reading the active App configuration."
            title="Loading Plugins"
          />
        ) : plugins.length === 0 ? (
          <WorkbenchState
            description="This App does not currently include any Plugins."
            title="No Plugins installed"
          />
        ) : visiblePlugins.length === 0 ? (
          <WorkbenchState
            title="No matching Plugins"
            description={`No Plugins match these filters for ${selectedApp.label}.`}
            action={
              <Button
                size="compact"
                variant="secondary"
                onClick={() => {
                  onCategoryChange("all");
                  setQuery("");
                  setSelection("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <section
            aria-labelledby="plugins-heading"
            {...stylex.props(styles.tableRegion, styles.inventoryList)}
          >
            <div aria-hidden="true" {...stylex.props(styles.columns)}>
              <span>Plugin</span>
              <span {...stylex.props(styles.packageColumn)}>Source</span>
              <span>Status</span>
            </div>
            {visiblePlugins.map((plugin) => {
              const state = pluginStatusPresentation({
                inventory,
                item: plugin,
                mutation: mutation.variables,
                operation: mutation.operation,
              });
              return (
                <Link
                  key={pluginKey(plugin)}
                  params={{
                    agentId: selectedApp.id,
                    instanceKey: plugin.instanceKey,
                    packageId: plugin.packageId,
                  }}
                  to="/plugins/$agentId/$packageId/$instanceKey"
                  {...stylex.props(styles.row)}
                >
                  <span {...stylex.props(styles.identity)}>
                    <span {...stylex.props(styles.primary)}>
                      {pluginDisplayName(plugin)}
                    </span>
                    <span {...stylex.props(styles.secondary)}>
                      {plugin.packageId}/{plugin.instanceKey}
                    </span>
                  </span>
                  <span
                    {...stylex.props(styles.identity, styles.packageColumn)}
                  >
                    <span {...stylex.props(styles.secondary)}>
                      {pluginOriginLabel(plugin)}
                    </span>
                    <span {...stylex.props(styles.secondary)}>
                      {plugin.active &&
                      plugin.desired &&
                      !pluginSelectionIdentityMatches(
                        plugin.active,
                        plugin.desired
                      )
                        ? `${plugin.active.packageRevision} → ${plugin.desired.packageRevision}`
                        : plugin.packageRevision || "linked"}
                    </span>
                  </span>
                  <PluginStatus state={state} />
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

function WorkbenchState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section aria-live="polite" {...stylex.props(styles.state)}>
      <h2 {...stylex.props(styles.stateTitle)}>{title}</h2>
      <p {...stylex.props(styles.stateDescription)}>{description}</p>
      {action}
    </section>
  );
}
