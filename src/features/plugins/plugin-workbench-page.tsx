import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import { useAgentIdentity } from "../agent/agent-identity-context";
import {
  AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
  type AgentIdentity,
} from "../agent/agent-runtime";
import { usePluginAgentWorkbench } from "./plugin-agent-workbench-context";
import { applyPluginWorkbenchRequest } from "./plugin-agent-workbench-request";
import { PluginDraftNavigationGuard } from "./plugin-draft-navigation-guard";
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
  headerSubrow: {
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
  const { agents, selectAgent, selectedAgent } = useAgentIdentity();
  const { request } = usePluginAgentWorkbench();
  useEffect(() => {
    if (
      request &&
      request.agentId !== selectedAgent.id &&
      agents.some((agent) => agent.id === request.agentId)
    ) {
      selectAgent(request.agentId);
    }
  }, [agents, request, selectAgent, selectedAgent.id]);
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
    const requestedPlugin = workbench.data.items.find(
      (plugin) => pluginKey(plugin) === result.selectedKey
    );
    if (requestedPlugin) {
      completeRequest(request.id);
      navigate({
        params: {
          agentId: selectedAgent.id,
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
    selectedAgent.id,
    workbench.data,
  ]);
  const mutation = usePluginMutation(selectedAgent.id, inventory?.streamId);
  return (
    <div data-page="plugin-workbench" {...stylex.props(styles.page)}>
      <PluginDraftNavigationGuard store={configurationDraftStore} />
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
          <div aria-hidden="true" {...stylex.props(styles.columns)}>
            <span>Plugin</span>
            <span {...stylex.props(styles.packageColumn)}>Package</span>
            <span>Status</span>
          </div>
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
              <Link
                key={pluginKey(plugin)}
                params={{
                  agentId: selectedAgent.id,
                  instanceKey: plugin.instanceKey,
                  packageId: plugin.packageId,
                }}
                to="/plugins/$agentId/$packageId/$instanceKey"
                {...stylex.props(styles.row)}
              >
                <span {...stylex.props(styles.identity)}>
                  <span {...stylex.props(styles.primary)}>
                    {plugin.packageId}/{plugin.instanceKey}
                  </span>
                  <span {...stylex.props(styles.secondary)}>
                    {pluginOriginLabel(plugin)}
                  </span>
                </span>
                <span {...stylex.props(styles.identity, styles.packageColumn)}>
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
              </Link>
            );
          })}
        </section>
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
