import {
  consolePluginDescriptorSchema,
  type ConsolePluginDescriptor,
} from "@lenso/console-sdk/protocol";
import { createConsoleClient } from "@lenso/console-sdk/transport";
import { Button } from "@lenso/ui/button";
import { Link } from "@lenso/ui/link";
import { SearchField } from "@lenso/ui/search-field";
import { Table } from "@lenso/ui/table";
import { Tabs } from "@lenso/ui/tabs";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { useConsoleSession } from "../../app/console-session";
import { consoleHttpPaths } from "../../lib/console-http-paths";
import { sessionFetch } from "../../lib/session-fetch";
import {
  useAppManagement,
  type ManagedApp,
} from "../apps/app-management-context";
import {
  BackToPlugins,
  DetailState,
  PluginDetailShell,
} from "./plugin-detail-page";
import { pluginInspectorStyles as detail } from "./plugin-inspector.stylex";
import { WorkbenchState } from "./plugin-workbench-page";
import { pluginWorkbenchStyles as list } from "./plugin-workbench-page.stylex";

function useTypeScriptPlugins(app: ManagedApp) {
  const { subject } = useConsoleSession();
  return useQuery({
    queryKey: ["typescript-plugins", subject, app.id],
    enabled: app.pluginConfiguration !== false,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createConsoleClient({
        url: `/${consoleHttpPaths.api_base_path.slice(1)}/console/v2/rpc`,
        headers: { "X-Lenso-Expected-Subject": subject },
        fetch: (input, init) => sessionFetch(input, init),
      });
      const response = await client.plugins({ targetId: app.id }, { signal });
      signal.throwIfAborted();
      if (response.schemaVersion !== 1 || !Array.isArray(response.plugins)) {
        throw new TypeError("Plugin metadata response is malformed");
      }
      const plugins = response.plugins.map((plugin) =>
        consolePluginDescriptorSchema.parse(plugin)
      );
      if (plugins.some((plugin) => plugin.targetId !== app.id)) {
        throw new TypeError("Plugin metadata belongs to another target");
      }
      return plugins;
    },
  });
}

function inspectionError(
  error: unknown,
  t: ReturnType<typeof useConsoleTranslation>
) {
  return error instanceof Error &&
    "code" in error &&
    (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
    ? t(
        "Access denied for this account. Ask the host administrator for permission to inspect this target."
      )
    : t(
        "Plugin metadata could not be loaded. Try again to read the current host state."
      );
}

export function TypeScriptPluginList({
  selectedApp,
}: {
  selectedApp: ManagedApp;
}) {
  const query = useTypeScriptPlugins(selectedApp);
  const t = useConsoleTranslation();
  const { pluginFilters, updatePluginFilters } = useAppManagement();
  const search = pluginFilters.query;
  const visible =
    query.data?.filter((plugin) =>
      plugin.id.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    ) ?? [];
  return (
    <div {...stylex.props(list.body)}>
      <div {...stylex.props(list.toolbar)}>
        <SearchField.Root xstyle={list.search}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input
              aria-label={t("Search plugins")}
              placeholder={t("Search plugins…")}
              value={search}
              onValueChange={(value) =>
                updatePluginFilters(selectedApp.id, { query: value })
              }
            />
            <SearchField.ClearButton aria-label={t("Clear search")} />
          </SearchField.Group>
        </SearchField.Root>
      </div>
      <TypeScriptPluginListContent
        selectedApp={selectedApp}
        query={query}
        visible={visible}
      />
    </div>
  );
}

function TypeScriptPluginListContent({
  selectedApp,
  query,
  visible,
}: {
  selectedApp: ManagedApp;
  query: ReturnType<typeof useTypeScriptPlugins>;
  visible: readonly ConsolePluginDescriptor[];
}) {
  const t = useConsoleTranslation();
  if (selectedApp.pluginConfiguration === false) {
    return (
      <WorkbenchState
        title={t("Plugin configuration unavailable")}
        description={t(
          "{app} does not expose Plugin configuration inspection.",
          {
            app: selectedApp.label,
          }
        )}
      />
    );
  }
  if (query.isError) {
    return (
      <WorkbenchState
        title={t("Plugins unavailable")}
        description={inspectionError(query.error, t)}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {t("Try again")}
          </Button>
        }
      />
    );
  }
  if (query.isPending) {
    return (
      <WorkbenchState
        title={t("Loading Plugins")}
        description={t("Reading current host configuration metadata.")}
      />
    );
  }
  if (query.data.length === 0) {
    return (
      <WorkbenchState
        title={t("No Plugins available")}
        description={t(
          "This target reports no Plugin instances visible to this account."
        )}
      />
    );
  }
  if (visible.length === 0) {
    return (
      <WorkbenchState
        title={t("No matching Plugins")}
        description={t("No Plugins match this search for {app}.", {
          app: selectedApp.label,
        })}
      />
    );
  }
  return (
    <div {...stylex.props(list.inventory)}>
      <output {...stylex.props(list.summary)}>
        {t("{count} Plugins", { count: visible.length })}
      </output>
      <Table.Root variant="secondary">
        <Table.Content
          aria-label={t("Plugins")}
          selectionMode="none"
          xstyle={list.table}
        >
          <Table.Header>
            <Table.Column columnKey="plugin" width="2fr" tabIndex={-1}>
              {t("Plugin instance")}
            </Table.Column>
            <Table.Column columnKey="configuration" width="1fr" tabIndex={-1}>
              {t("Configuration")}
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {visible.map((plugin) => (
              <Table.Row
                key={plugin.id}
                itemKey={plugin.id}
                textValue={plugin.id}
              >
                <Table.Cell columnKey="plugin" xstyle={list.identifier}>
                  <Link
                    xstyle={list.primary}
                    render={
                      <RouterLink
                        to="/plugins/$agentId/$packageId/$instanceKey"
                        params={{
                          agentId: selectedApp.id,
                          packageId: plugin.id,
                          instanceKey: plugin.id,
                        }}
                      />
                    }
                  >
                    {plugin.id}
                  </Link>
                </Table.Cell>
                <Table.Cell columnKey="configuration" xstyle={list.identifier}>
                  {t(plugin.configuration.state)} · {t("Read-only")}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.Root>
    </div>
  );
}

export function TypeScriptPluginDetail({
  selectedApp,
  packageId,
  instanceKey,
}: {
  selectedApp: ManagedApp;
  packageId: string;
  instanceKey: string;
}) {
  const query = useTypeScriptPlugins(selectedApp);
  const [tab, setTab] = useState<"overview" | "configuration">("overview");
  return (
    <PluginDetailShell
      tab={tab}
      onTabChange={(value) => {
        if (value === "overview" || value === "configuration") {
          setTab(value);
        }
      }}
    >
      <TypeScriptPluginDetailContent
        selectedApp={selectedApp}
        query={query}
        packageId={packageId}
        instanceKey={instanceKey}
        onViewConfiguration={() => setTab("configuration")}
      />
    </PluginDetailShell>
  );
}

function TypeScriptPluginDetailContent({
  selectedApp,
  query,
  packageId,
  instanceKey,
  onViewConfiguration,
}: {
  selectedApp: ManagedApp;
  query: ReturnType<typeof useTypeScriptPlugins>;
  packageId: string;
  instanceKey: string;
  onViewConfiguration: () => void;
}) {
  const t = useConsoleTranslation();
  if (selectedApp.pluginConfiguration === false) {
    return (
      <DetailState
        action={<BackToPlugins />}
        title={t("Plugin configuration unavailable")}
        description={t(
          "{app} does not expose Plugin configuration inspection.",
          {
            app: selectedApp.label,
          }
        )}
      />
    );
  }
  if (query.isError) {
    return (
      <DetailState
        title={t("Plugin unavailable")}
        description={inspectionError(query.error, t)}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {t("Try again")}
          </Button>
        }
      />
    );
  }
  if (query.isPending) {
    return (
      <DetailState
        title={t("Loading Plugin")}
        description={t("Reading current host configuration metadata.")}
      />
    );
  }
  const plugin = query.data.find(
    (item) => item.id === instanceKey && item.id === packageId
  );
  if (!plugin) {
    return (
      <DetailState
        action={<BackToPlugins />}
        title={t("Plugin not found")}
        description={t(
          "This Plugin instance is no longer reported by the selected target."
        )}
      />
    );
  }
  return (
    <TypeScriptPluginMetadata
      selectedApp={selectedApp}
      plugin={plugin}
      onViewConfiguration={onViewConfiguration}
    />
  );
}

function TypeScriptPluginMetadata({
  selectedApp,
  plugin,
  onViewConfiguration,
}: {
  selectedApp: ManagedApp;
  plugin: ConsolePluginDescriptor;
  onViewConfiguration: () => void;
}) {
  const t = useConsoleTranslation();
  return (
    <div {...stylex.props(detail.detailRoot)}>
      <header {...stylex.props(detail.detailHeader)}>
        <div {...stylex.props(detail.detailIdentity)}>
          <h1 {...stylex.props(detail.detailTitle)}>{plugin.id}</h1>
          <p {...stylex.props(detail.feedback)}>
            {t("Target: {app} ({target})", {
              app: selectedApp.label,
              target: plugin.targetId,
            })}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onViewConfiguration}>
          {t("View configuration")}
        </Button>
      </header>
      <p {...stylex.props(detail.statusSummary)}>
        {t("Configuration")}: {t(plugin.configuration.state)} · {t("Read-only")}
      </p>
      <Tabs.ListContainer xstyle={detail.detailTabsContainer}>
        <Tabs.List aria-label={t("Plugin details")} xstyle={detail.detailTabs}>
          <Tabs.Tab value="overview" xstyle={detail.detailTab}>
            {t("Overview")}
          </Tabs.Tab>
          <Tabs.Tab value="configuration" xstyle={detail.detailTab}>
            {t("Configuration")}
          </Tabs.Tab>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel value="overview" xstyle={detail.tabPanel}>
        <section {...stylex.props(detail.section)}>
          <h2 {...stylex.props(detail.sectionTitle)}>
            {t("Current startup metadata")}
          </h2>
          <p {...stylex.props(detail.value)}>
            {t(
              "This target reports configuration state and provenance for this instance. Values, schema, defaults and revisions are not exposed."
            )}
          </p>
          <ReadOnlyReason plugin={plugin} />
        </section>
      </Tabs.Panel>
      <Tabs.Panel value="configuration" xstyle={detail.tabPanel}>
        <section {...stylex.props(detail.section)}>
          <h2 {...stylex.props(detail.sectionTitle)}>
            {t("Configuration inspection")}
          </h2>
          <ReadOnlyReason plugin={plugin} />
          <h3 {...stylex.props(detail.sectionTitle)}>{t("Sources")}</h3>
          {plugin.configuration.sources.length === 0 ? (
            <p {...stylex.props(detail.value)}>
              {t("No configuration sources reported.")}
            </p>
          ) : (
            <dl {...stylex.props(detail.fields)}>
              {plugin.configuration.sources.map((source) => (
                <div key={source.id} {...stylex.props(detail.field)}>
                  <dt {...stylex.props(detail.value)}>{source.id}</dt>
                  <dd {...stylex.props(detail.value)}>{t(source.kind)}</dd>
                </div>
              ))}
            </dl>
          )}
          <h3 {...stylex.props(detail.sectionTitle)}>
            {t("Field provenance")}
          </h3>
          {plugin.configuration.fields.length === 0 ? (
            <p {...stylex.props(detail.value)}>
              {t(
                "No field provenance reported. This does not imply default values."
              )}
            </p>
          ) : (
            <dl {...stylex.props(detail.fields)}>
              {plugin.configuration.fields.map((field) => (
                <div
                  key={JSON.stringify(field.path)}
                  {...stylex.props(detail.field)}
                >
                  <dt {...stylex.props(detail.value)}>
                    {JSON.stringify(field.path)}
                  </dt>
                  <dd {...stylex.props(detail.value)}>
                    {field.sourceIds.length
                      ? field.sourceIds.join(", ")
                      : t("No source reported")}
                    {field.sensitive
                      ? ` · ${t("Sensitive (value not exposed)")}`
                      : ` · ${t("Value not exposed")}`}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </Tabs.Panel>
    </div>
  );
}

function ReadOnlyReason({ plugin }: { plugin: ConsolePluginDescriptor }) {
  const t = useConsoleTranslation();
  const reason = plugin.configuration.unavailableReason;
  const genericReason =
    "Startup configuration is read-only here. Change the application-owned source and restart.";
  const legacyReason =
    "The host ConfigSource exposes startup metadata only; no write, compare-and-swap or publish API is available.";
  return (
    <>
      <p {...stylex.props(detail.value)}>
        {t("Read-only")}:{" "}
        {!reason || reason === genericReason || reason === legacyReason
          ? t(genericReason)
          : reason}
      </p>
      <p {...stylex.props(detail.value)}>
        {t(
          "Change the application-owned configuration source, then restart the application and reload this page."
        )}
      </p>
    </>
  );
}
