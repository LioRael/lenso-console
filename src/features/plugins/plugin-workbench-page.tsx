import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  useAppManagement,
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
import { pluginPurpose } from "./plugin-purpose";
import { pluginStatusPresentation } from "./plugin-runtime-state";
import { PluginStatus } from "./plugin-status";
import { PluginTargetSelect } from "./plugin-target-select";
import { InstallPluginDialog } from "./plugin-workbench-dialogs";
import { pluginKey, type PluginWorkbenchItem } from "./plugin-workbench-model";
import {
  usePluginConfigurationDraftStore,
  usePluginMutation,
  usePluginWorkbench,
} from "./use-plugin-workbench";

const EMPTY_PLUGIN_ITEMS: readonly PluginWorkbenchItem[] = [];

const styles = stylex.create({
  targetRow: {
    paddingBlockEnd: 16,
    borderBottom: "1px solid var(--color-border-tertiary)",
  },
  body: { display: "grid", gap: 4 },
  filterOptions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    paddingBlock: "8px 4px",
  },
  scopeTabs: {
    display: "flex",
    gap: 24,
    padding: 0,
    boxShadow: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    overflowX: "auto",
    borderBottom: "1px solid var(--color-border-tertiary)",
  },
  workbench: {
    maxWidth: 960,
    width: "calc(100% - 48px)",
    display: "grid",
    gap: 16,
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
    paddingBlock: 0,
  },
  tabs: { minWidth: 0, flex: "1 1 540px", overflowX: "auto", paddingBlock: 2 },
  tab: {
    borderRadius: 0,
    boxShadow: "none",
    fontSize: 12,
    minHeight: 36,
    paddingInline: 0,
    flexShrink: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 2,
    borderStyle: "solid",
    borderColor: "transparent",
  },
  tabActive: {
    backgroundColor: "transparent",
    borderBottomWidth: 2,
    borderBottomColor: tokens.colorContentPrimary,
    color: tokens.colorContentPrimary,
  },
  count: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    marginInlineStart: 6,
    fontVariantNumeric: "tabular-nums",
  },
  controls: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    width: "100%",
    justifyContent: "flex-start",
  },
  search: { width: 240, minWidth: 140, maxWidth: "100%", flex: "0 1 280px" },
  columns: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    fontSize: 11,
    fontWeight: 500,
    gap: 16,
    gridTemplateColumns: "minmax(0, 1fr) 144px",
    minHeight: 34,
    paddingInline: 0,
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 132px",
    },
  },
  header: {
    height: "auto",
    minWidth: 0,
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  filterButton: { marginInlineStart: "auto" },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: tokens.space3,
  },
  headerSubrow: {
    height: "auto",
    minHeight: 32,
    paddingInline: 0,
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
    color: tokens.colorContentPrimary,
    boxSizing: "border-box",
    display: "block",
    overflowY: "auto",
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
    borderRadius: 0,
    borderStyle: "none",
    color: tokens.colorContentSecondary,
    cursor: "pointer",
    display: "grid",
    fontFamily: tokens.fontSans,
    fontSize: 12,
    gap: tokens.space4,
    gridTemplateColumns: "minmax(0, 1fr) 144px",
    marginInline: 0,
    minHeight: 64,
    paddingBlock: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorBorderTertiary,
    ":last-child": { borderBottomWidth: 0 },
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -2,
    paddingInline: 0,
    textAlign: "left",
    textDecoration: "none",
    width: "100%",
    boxSizing: "border-box",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 132px",
    },
  },
  purpose: {
    color: tokens.colorContentTertiary,
    fontSize: 12,
    lineHeight: "18px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    paddingBlock: 0,
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
  const { apps, selectApp, selectedApp, catalog } = useAppManagement();
  const { request } = usePluginAgentWorkbench();
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
    <main data-page="plugin-workbench" {...stylex.props(styles.page)}>
      <div {...stylex.props(pageStyles.column, styles.workbench)}>
        <SettingsPageHeader
          title="Plugins"
          description="Manage the plugins installed in your Apps."
        />
        <div {...stylex.props(styles.targetRow)}>
          <PluginTargetSelect />
        </div>
        <div {...stylex.props(styles.tableRegion)}>
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
            />
          ) : (
            <WorkbenchState
              title="No Apps connected"
              description="Connect a Lenso App to manage its plugins here."
            />
          )}
        </div>
      </div>
    </main>
  );
}

function AppPluginWorkbench({ selectedApp }: { selectedApp: ManagedApp }) {
  const { pluginFilters, updatePluginFilters } = useAppManagement();
  const { category, query, selection } = pluginFilters;
  const onCategoryChange = (nextCategory: PluginCategory) =>
    updatePluginFilters(selectedApp.id, { category: nextCategory });
  const setQuery = (nextQuery: string) =>
    updatePluginFilters(selectedApp.id, { query: nextQuery });
  const setSelection = (nextSelection: PluginSelectionFilter) =>
    updatePluginFilters(selectedApp.id, { selection: nextSelection });
  const [showFilters, setShowFilters] = useState(false);
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
    <div {...stylex.props(styles.body)}>
      <PluginDraftNavigationGuard store={configurationDraftStore} />
      {configurationAvailable ? (
        <div aria-label="Plugin filters" {...stylex.props(styles.headerSubrow)}>
          <div {...stylex.props(styles.toolbar)}>
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
              <Button
                variant="ghost"
                size="compact"
                xstyle={styles.filterButton}
                aria-expanded={showFilters}
                onClick={() => setShowFilters((value) => !value)}
              >
                Filters
                {category !== "all" || selection !== "all"
                  ? ` · ${Number(category !== "all") + Number(selection !== "all")}`
                  : ""}
              </Button>
              {selectedApp.localBundleInstall ? (
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
              ) : null}
            </div>
          </div>
          {showFilters ? (
            <div {...stylex.props(styles.filterOptions)}>
              <PluginFilterSelect
                label="Plugin category"
                value={category}
                onValueChange={onCategoryChange}
                options={pluginCategories.map((item) => ({
                  value: item.id,
                  label: `${item.label}${workbench.data ? ` (${item.id === "all" ? plugins.length : plugins.filter((plugin) => categoriesForPlugin(plugin).includes(item.id)).length})` : ""}`,
                }))}
              />
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
            </div>
          ) : null}
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
                  title={`${plugin.packageId}/${plugin.instanceKey}`}
                  to="/plugins/$agentId/$packageId/$instanceKey"
                  {...stylex.props(styles.row)}
                >
                  <span {...stylex.props(styles.identity)}>
                    <span {...stylex.props(styles.primary)}>
                      {pluginDisplayName(plugin)}
                      {plugins.some(
                        (other) =>
                          other.packageId === plugin.packageId &&
                          other.instanceKey !== plugin.instanceKey
                      ) ? (
                        <span {...stylex.props(styles.secondary)}>
                          · {plugin.instanceKey}
                        </span>
                      ) : null}
                    </span>
                    <span {...stylex.props(styles.purpose)}>
                      {pluginPurpose(plugin)}
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
