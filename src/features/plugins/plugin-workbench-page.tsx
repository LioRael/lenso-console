import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
import { StatusMarker } from "@lenso/ui/status-marker";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import { useAgentIdentity } from "../agent/agent-identity-context";
import {
  AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
  type AgentIdentity,
} from "../agent/agent-runtime";
import { usePluginAgentWorkbench } from "./plugin-agent-workbench-context";
import { applyPluginWorkbenchRequest } from "./plugin-agent-workbench-request";
import { PluginInspector } from "./plugin-inspector";
import {
  generationStatusPresentation,
  pluginOriginLabel,
  pluginSelectionIdentityMatches,
  pluginStatusPresentation,
} from "./plugin-runtime-state";
import { PluginStatus } from "./plugin-status";
import { InstallPluginDialog } from "./plugin-workbench-dialogs";
import {
  pluginKey,
  reconcilePluginSelectionKey,
  type PluginWorkbenchItem,
} from "./plugin-workbench-model";
import {
  usePluginConfigurationDraftStore,
  usePluginMutation,
  usePluginWorkbench,
} from "./use-plugin-workbench";

const EMPTY_PLUGIN_ITEMS: readonly PluginWorkbenchItem[] = [];

const styles = stylex.create({
  breadcrumbParent: {
    display: "inline-flex",
    "@media (max-width: 420px)": {
      display: "none",
    },
  },
  columns: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    fontSize: 11,
    fontWeight: 500,
    gap: tokens.space4,
    gridTemplateColumns: "minmax(180px, 1.4fr) minmax(180px, 1fr) 88px",
    height: "100%",
    paddingInline: 14,
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 88px",
    },
  },
  detailsColumnHeading: {
    alignItems: "center",
    borderInlineStartColor: tokens.colorBorderTertiary,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    color: tokens.colorContentTertiary,
    display: "flex",
    fontSize: 11,
    fontWeight: 500,
    height: "100%",
    paddingInline: 14,
    "@media (max-width: 1120px)": {
      display: "none",
    },
  },
  header: {
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
  headerStatusLabel: {
    "@media (max-width: 560px)": {
      display: "none",
    },
  },
  headerStatus: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "inline-flex",
    fontSize: 11,
    gap: tokens.space2,
  },
  headerSubrow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 340px)",
    paddingInline: 0,
    "@media (max-width: 1120px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  identity: { display: "grid", gap: 2, minWidth: 0 },
  inspector: {
    borderInlineStartColor: tokens.colorBorderTertiary,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    minWidth: 0,
    overflowX: "hidden",
    overflowY: "auto",
    "@media (max-width: 1120px)": {
      borderBlockStartColor: tokens.colorBorderTertiary,
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: 1,
      borderInlineStartStyle: "none",
      minHeight: 280,
    },
  },
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
    gridTemplateRows: "87.5px minmax(0, 1fr)",
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
    gridTemplateColumns: "minmax(172px, 1.4fr) minmax(172px, 1fr) 88px",
    marginInline: 8,
    minHeight: 54,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -2,
    paddingInline: 6,
    textAlign: "left",
    width: "calc(100% - 16px)",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 88px",
    },
  },
  rowSelected: {
    backgroundColor: {
      default: tokens.colorSurfaceSelected,
      ":hover": tokens.colorSurfaceSelected,
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
  workbenchNotice: {
    alignItems: "center",
    backgroundColor: tokens.colorSurfaceSubtle,
    color: tokens.colorContentSecondary,
    display: "flex",
    fontSize: 12,
    gridColumn: "1 / -1",
    lineHeight: "18px",
    height: "100%",
    paddingInline: 14,
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
  workspace: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 340px)",
    minHeight: 0,
    overflow: "hidden",
    "@media (max-width: 1120px)": {
      display: "block",
      overflow: "auto",
    },
  },
});

export function PluginWorkbenchPage() {
  const { selectedAgent } = useAgentIdentity();
  return (
    <AgentPluginWorkbench
      key={selectedAgent.id}
      selectedAgent={selectedAgent}
    />
  );
}

function AgentPluginWorkbench({
  selectedAgent,
}: {
  selectedAgent: AgentIdentity;
}) {
  const configurationAvailable = selectedAgent.capabilities.includes(
    AGENT_PLUGIN_CONFIGURATION_CAPABILITY
  );
  const workbench = usePluginWorkbench(
    selectedAgent.id,
    configurationAvailable
  );
  const plugins = workbench.data?.items ?? EMPTY_PLUGIN_ITEMS;
  const inventory = workbench.data?.inventory;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [workbenchNotice, setWorkbenchNotice] = useState<string | null>(null);
  const { request } = usePluginAgentWorkbench();
  const appliedRequestId = useRef(0);
  const reconciledSelectedKey = reconcilePluginSelectionKey(
    selectedKey,
    workbench.data ? plugins : undefined
  );
  const selected =
    plugins.find((plugin) => pluginKey(plugin) === reconciledSelectedKey) ??
    plugins[0];
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
      request.agentId !== selectedAgent.id ||
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
    setSelectedKey(result.selectedKey);
    setWorkbenchNotice(result.notice);
  }, [configurationDraftStore, request, selectedAgent.id, workbench.data]);
  const mutation = usePluginMutation(selectedAgent.id, inventory?.streamId);
  const generation = inventory
    ? generationStatusPresentation({
        inventory,
        operation: mutation.operation,
      })
    : null;
  const degradedDescription = workbench.data
    ? workbench.error instanceof Error
      ? `Showing the last verified Plugin state while the Host reconnects: ${workbench.error.message}`
      : workbench.authoringEnabled
        ? null
        : "Plugin changes are paused until the Host authoring and runtime revisions agree."
    : null;
  return (
    <div data-page="plugin-workbench" {...stylex.props(styles.page)}>
      <PageHeader.Root
        aria-label="Plugin navigation"
        {...stylex.props(styles.header)}
        variant="team"
      >
        <PageHeader.Row>
          <Breadcrumb.Root aria-label="Plugin breadcrumb">
            <Breadcrumb.List>
              <Breadcrumb.Item xstyle={styles.breadcrumbParent}>
                <Breadcrumb.Link nativeButton={false} render={<Link to="/" />}>
                  <Breadcrumb.Icon>
                    <Boxes size={14} strokeWidth={1.75} />
                  </Breadcrumb.Icon>
                  Lenso
                </Breadcrumb.Link>
              </Breadcrumb.Item>
              <Breadcrumb.Separator xstyle={styles.breadcrumbParent} />
              <Breadcrumb.Item>
                <Breadcrumb.Page>Plugins</Breadcrumb.Page>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>
          <PageHeader.Spacer />
          <PageHeader.Actions>
            <div {...stylex.props(styles.headerActions)}>
              {generation ? (
                <span
                  title={generation.description}
                  {...stylex.props(styles.headerStatus)}
                >
                  <StatusMarker presentation="dot" status={generation.tone} />
                  <span {...stylex.props(styles.headerStatusLabel)}>
                    {generation.label}
                  </span>
                </span>
              ) : null}
              {degradedDescription ? (
                <output
                  title={degradedDescription}
                  {...stylex.props(styles.headerStatus)}
                >
                  <StatusMarker presentation="dot" status="warning" />
                  Changes paused
                </output>
              ) : null}
              <InstallPluginDialog
                disabled={
                  !workbench.authoringEnabled ||
                  selectedAgent.role !== "console"
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
            </div>
          </PageHeader.Actions>
        </PageHeader.Row>
        <PageHeader.TabsRow xstyle={styles.headerSubrow}>
          {workbenchNotice ? (
            <output
              aria-live="polite"
              {...stylex.props(styles.workbenchNotice)}
            >
              {workbenchNotice}
            </output>
          ) : (
            <>
              <div aria-hidden="true" {...stylex.props(styles.columns)}>
                <span>Plugin</span>
                <span {...stylex.props(styles.packageColumn)}>Package</span>
                <span>Status</span>
              </div>
              <span
                aria-hidden="true"
                {...stylex.props(styles.detailsColumnHeading)}
              >
                Details
              </span>
            </>
          )}
        </PageHeader.TabsRow>
      </PageHeader.Root>
      <h1 id="plugins-heading" {...stylex.props(styles.visuallyHidden)}>
        Plugins
      </h1>
      {workbench.isPending ? (
        <WorkbenchState
          description="Reading the active App configuration."
          title="Loading Plugins"
        />
      ) : workbench.configurationAvailable === false ? (
        <WorkbenchState
          description={`${selectedAgent.label} does not provide ${AGENT_PLUGIN_CONFIGURATION_CAPABILITY}, so Console cannot read or change its Plugin configuration.`}
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
      ) : (
        <div {...stylex.props(styles.workspace)}>
          <section
            aria-labelledby="plugins-heading"
            {...stylex.props(styles.tableRegion)}
          >
            {plugins.map((plugin) => {
              const state = pluginStatusPresentation({
                inventory,
                item: plugin,
                mutation: mutation.variables,
                operation: mutation.operation,
              });
              return (
                <button
                  aria-pressed={
                    selected && pluginKey(selected) === pluginKey(plugin)
                  }
                  key={pluginKey(plugin)}
                  onClick={() => {
                    mutation.reset();
                    setSelectedKey(pluginKey(plugin));
                  }}
                  type="button"
                  {...stylex.props(
                    styles.row,
                    selected &&
                      pluginKey(selected) === pluginKey(plugin) &&
                      styles.rowSelected
                  )}
                >
                  <span {...stylex.props(styles.identity)}>
                    <span {...stylex.props(styles.primary)}>
                      {plugin.packageId}/{plugin.instanceKey}
                    </span>
                    <span {...stylex.props(styles.secondary)}>
                      {pluginOriginLabel(plugin)}
                    </span>
                  </span>
                  <span
                    {...stylex.props(styles.identity, styles.packageColumn)}
                  >
                    <span {...stylex.props(styles.secondary, styles.mono)}>
                      {plugin.packageId}
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
                </button>
              );
            })}
          </section>

          <aside
            aria-label="Plugin details"
            {...stylex.props(styles.inspector)}
          >
            {selected && inventory && workbench.data ? (
              <PluginInspector
                agentId={selectedAgent.id}
                authoringEnabled={workbench.authoringEnabled}
                configurationDraftStore={configurationDraftStore}
                inventory={inventory}
                key={pluginKey(selected)}
                management={workbench.data.management}
                mutation={mutation}
                plugin={selected}
                selectionAuthoringEnabled={selectedAgent.role === "console"}
              />
            ) : null}
          </aside>
        </div>
      )}
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
