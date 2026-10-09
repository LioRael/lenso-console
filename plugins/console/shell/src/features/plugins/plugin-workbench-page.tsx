import { Button } from "@lenso/ui/button";
import { EmptyState } from "@lenso/ui/empty-state";
import { useMediaQuery } from "@lenso/ui/hooks";
import { Link } from "@lenso/ui/link";
import { SearchField } from "@lenso/ui/search-field";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { useConsoleSession } from "../../app/console-session";
import { ConsolePageHeader } from "../../components/runtime/console-page-header";
import {
  useAppManagement,
  type ManagedApp,
} from "../apps/app-management-context";
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
  pluginStatusPresentation,
  type PluginStatusPresentation,
} from "./plugin-runtime-state";
import { PluginStatus } from "./plugin-status";
import { PluginTargetSelect } from "./plugin-target-select";
import { InstallPluginDialog } from "./plugin-workbench-dialogs";
import { pluginKey, type PluginWorkbenchItem } from "./plugin-workbench-model";
import { pluginWorkbenchStyles as styles } from "./plugin-workbench-page.stylex";
import { TypeScriptPluginList } from "./typescript-plugin-inspector";
import {
  usePluginConfigurationDraftStore,
  usePluginMutation,
  usePluginWorkbench,
} from "./use-plugin-workbench";

const EMPTY_PLUGIN_ITEMS: readonly PluginWorkbenchItem[] = [];

export function PluginWorkbenchPage() {
  const t = useConsoleTranslation();
  const session = useConsoleSession();

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
    <div data-page="plugin-workbench" {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.workbench)}>
        <ConsolePageHeader
          title={t("Plugins")}
          description={t("Manage the plugins installed in your Apps.")}
          actions={<PluginTargetSelect />}
        />
        <div>
          {catalog.isPending ? (
            <WorkbenchState
              title={t("Loading Apps")}
              description={t("Reading management targets.")}
            />
          ) : catalog.isError ? (
            <WorkbenchState
              title={t("Apps unavailable")}
              description={t("The App management catalog could not be loaded.")}
              action={
                <Button
                  onClick={() => {
                    void catalog.refetch();
                  }}
                >
                  {t("Try again")}
                </Button>
              }
            />
          ) : selectedApp ? (
            session.managementProtocol === "lenso-console-rpc/2" ? (
              <TypeScriptPluginList
                key={selectedApp.id}
                selectedApp={selectedApp}
              />
            ) : (
              <AppPluginWorkbench
                key={selectedApp.id}
                selectedApp={selectedApp}
              />
            )
          ) : (
            <WorkbenchState
              title={t("No Apps connected")}
              description={t("Connect a Lenso App to manage its plugins here.")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AppPluginWorkbench({ selectedApp }: { selectedApp: ManagedApp }) {
  const t = useConsoleTranslation();

  const { pluginFilters, updatePluginFilters } = useAppManagement();
  const { category, query, selection } = pluginFilters;
  const onCategoryChange = (nextCategory: PluginCategory) =>
    updatePluginFilters(selectedApp.id, { category: nextCategory });
  const setQuery = (nextQuery: string) =>
    updatePluginFilters(selectedApp.id, { query: nextQuery });
  const setSelection = (nextSelection: PluginSelectionFilter) =>
    updatePluginFilters(selectedApp.id, { selection: nextSelection });
  const [showFilters, setShowFilters] = useState(false);
  const filtersId = useId();
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
        <>
          <div {...stylex.props(styles.toolbar)}>
            <SearchField.Root xstyle={styles.search}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  aria-label={t("Search plugins")}
                  placeholder={t("Search plugins…")}
                  value={query}
                  onValueChange={setQuery}
                />
                <SearchField.ClearButton aria-label={t("Clear search")} />
              </SearchField.Group>
            </SearchField.Root>
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={showFilters}
              aria-controls={filtersId}
              onClick={() => setShowFilters((value) => !value)}
            >
              {t("Filters")}
              {category !== "all" || selection !== "all"
                ? ` · ${Number(category !== "all") + Number(selection !== "all")}`
                : ""}
            </Button>
            {selectedApp.localBundleInstall ? (
              <div {...stylex.props(styles.headerActions)}>
                <InstallPluginDialog
                  disabled={!workbench.authoringEnabled}
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
              </div>
            ) : null}
          </div>
          {showFilters ? (
            <fieldset
              id={filtersId}
              aria-label={t("Plugin filters")}
              {...stylex.props(styles.filterOptions)}
            >
              <div {...stylex.props(styles.filterField)}>
                <span {...stylex.props(styles.filterLabel)}>
                  {t("Plugin category")}
                </span>
                <PluginFilterSelect
                  label={t("Plugin category")}
                  value={category}
                  onValueChange={onCategoryChange}
                  options={pluginCategories.map((item) => ({
                    value: item.id,
                    label: `${t(item.label)}${workbench.data ? ` (${item.id === "all" ? plugins.length : plugins.filter((plugin) => categoriesForPlugin(plugin).includes(item.id)).length})` : ""}`,
                  }))}
                />
              </div>
              <div {...stylex.props(styles.filterField)}>
                <span {...stylex.props(styles.filterLabel)}>
                  {t("Plugin selection")}
                </span>
                <PluginFilterSelect<PluginSelectionFilter>
                  label={t("Plugin selection")}
                  value={selection}
                  onValueChange={setSelection}
                  options={[
                    { value: "all", label: "All states" },
                    { value: "enabled", label: "Enabled" },
                    { value: "disabled", label: "Disabled" },
                  ]}
                />
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}
      <div {...stylex.props(styles.inventory)}>
        {configurationAvailable === false ? (
          <WorkbenchState
            title={t("Plugin management unavailable")}
            description={
              selectedApp.scope === "console-extensions"
                ? "Console has no connected extension management authority. Management Agent plugins are managed separately."
                : `${selectedApp.label} does not expose Plugin configuration management.`
            }
          />
        ) : workbench.isPending && !workbench.isError ? (
          <WorkbenchState
            description={t("Reading the active App configuration.")}
            title={t("Loading Plugins")}
          />
        ) : workbench.configurationAvailable === false ? (
          <WorkbenchState
            description={
              selectedApp.scope === "console-extensions"
                ? "Console has no connected extension management authority. Management Agent plugins are managed separately."
                : `${selectedApp.label} does not expose Plugin configuration management.`
            }
            title={t("Plugin configuration unavailable")}
          />
        ) : workbench.isError ? (
          <WorkbenchState
            action={
              <Button
                onClick={() => {
                  void workbench.refetch();
                }}
                size="sm"
                variant="secondary"
              >
                {t("Try again")}
              </Button>
            }
            description={
              workbench.error instanceof Error
                ? workbench.error.message
                : "The active App configuration could not be loaded."
            }
            title={t("Plugins unavailable")}
          />
        ) : !inventory || !workbench.data ? (
          <WorkbenchState
            description={t("Reading the active App configuration.")}
            title={t("Loading Plugins")}
          />
        ) : plugins.length === 0 ? (
          <WorkbenchState
            description={t("This App does not currently include any Plugins.")}
            title={t("No Plugins installed")}
          />
        ) : visiblePlugins.length === 0 ? (
          <WorkbenchState
            title={t("No matching Plugins")}
            description={`No Plugins match these filters for ${selectedApp.label}.`}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onCategoryChange("all");
                  setQuery("");
                  setSelection("all");
                }}
              >
                {t("Clear filters")}
              </Button>
            }
          />
        ) : (
          <PluginInventoryList
            plugins={visiblePlugins}
            total={plugins.length}
            statusFor={(plugin) =>
              pluginStatusPresentation({
                inventory,
                item: plugin,
                mutation: mutation.variables,
                operation: mutation.operation,
              })
            }
            appId={selectedApp.id}
          />
        )}
      </div>
    </div>
  );
}

function PluginInventoryList({
  appId,
  plugins,
  statusFor,
  total,
}: {
  appId: string;
  plugins: readonly PluginWorkbenchItem[];
  statusFor: (plugin: PluginWorkbenchItem) => PluginStatusPresentation;
  total: number;
}) {
  const t = useConsoleTranslation();
  const navigate = useNavigate();
  const compact = useMediaQuery("(max-width: 760px)");
  return (
    <>
      <output {...stylex.props(styles.summary)}>
        {plugins.length === total ? total : `${plugins.length} / ${total}`}{" "}
        {t(plugins.length === 1 ? "Plugin" : "Plugins")}
      </output>
      <Table.Root variant="secondary">
        <Table.Content
          aria-label={t("Plugins")}
          selectionMode="none"
          xstyle={styles.table}
        >
          <Table.Header>
            <Table.Column columnKey="plugin" width="2fr" tabIndex={-1}>
              {t("Plugin")}
            </Table.Column>
            {compact ? null : (
              <>
                <Table.Column columnKey="package" width="3fr" tabIndex={-1}>
                  {t("Package")}
                </Table.Column>
                <Table.Column
                  columnKey="instance"
                  width="1fr"
                  maxWidth={180}
                  tabIndex={-1}
                >
                  {t("Instance")}
                </Table.Column>
              </>
            )}
            <Table.Column
              columnKey="status"
              width="30%"
              minWidth={96}
              maxWidth={144}
              tabIndex={-1}
              xstyle={styles.status}
            >
              {t("Status")}
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {plugins.map((plugin) => {
              const route = {
                params: {
                  agentId: appId,
                  instanceKey: plugin.instanceKey,
                  packageId: plugin.packageId,
                },
                to: "/plugins/$agentId/$packageId/$instanceKey" as const,
              };
              return (
                <Table.Row
                  key={pluginKey(plugin)}
                  itemKey={pluginKey(plugin)}
                  textValue={pluginDisplayName(plugin)}
                  tabIndex={0}
                  xstyle={styles.row}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      (event.target instanceof Element &&
                        event.target.closest("a,button,input,select,textarea"))
                    ) {
                      return;
                    }
                    void navigate(route);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.key !== "Enter" ||
                      (event.target instanceof Element &&
                        event.target.closest("a,button,input,select,textarea"))
                    ) {
                      return;
                    }
                    event.preventDefault();
                    void navigate(route);
                  }}
                >
                  <Table.Cell columnKey="plugin" tabIndex={-1}>
                    <div {...stylex.props(styles.identity)}>
                      <Link
                        title={`${plugin.packageId}/${plugin.instanceKey}`}
                        render={<RouterLink {...route} />}
                        xstyle={styles.primary}
                      >
                        {pluginDisplayName(plugin)}
                      </Link>
                      {compact ? (
                        <span {...stylex.props(styles.secondary)}>
                          {plugin.packageId} / {plugin.instanceKey}
                        </span>
                      ) : null}
                    </div>
                  </Table.Cell>
                  {compact ? null : (
                    <>
                      <Table.Cell
                        columnKey="package"
                        tabIndex={-1}
                        xstyle={styles.identifier}
                      >
                        {plugin.packageId}
                      </Table.Cell>
                      <Table.Cell
                        columnKey="instance"
                        tabIndex={-1}
                        xstyle={styles.identifier}
                      >
                        {plugin.instanceKey}
                      </Table.Cell>
                    </>
                  )}
                  <Table.Cell
                    columnKey="status"
                    tabIndex={-1}
                    xstyle={styles.status}
                  >
                    <PluginStatus state={statusFor(plugin)} />
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.Root>
    </>
  );
}

export function WorkbenchState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <EmptyState aria-live="polite" xstyle={styles.state}>
      <h2 {...stylex.props(styles.stateTitle)}>{title}</h2>
      <p {...stylex.props(styles.stateDescription)}>{description}</p>
      {action}
    </EmptyState>
  );
}
