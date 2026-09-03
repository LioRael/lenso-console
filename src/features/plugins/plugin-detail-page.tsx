import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { PageHeader } from "@lenso/ui/page-header";
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
import { PluginDetail } from "./plugin-inspector";
import { pluginKey } from "./plugin-workbench-model";
import {
  usePluginConfigurationDraftStore,
  usePluginMutation,
  usePluginWorkbench,
} from "./use-plugin-workbench";

const styles = stylex.create({
  breadcrumbParent: {
    display: "inline-flex",
    "@media (max-width: 560px)": {
      display: "none",
    },
  },
  content: {
    minHeight: 0,
    overflow: "auto",
  },
  detail: {
    width: "100%",
  },
  header: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  page: {
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "87.5px minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
    width: "100%",
  },
  pageSimple: {
    gridTemplateRows: "44px minmax(0, 1fr)",
  },
  requestNotice: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.colorContentSecondary,
    display: "block",
    fontSize: 12,
    lineHeight: "18px",
    marginBlockEnd: tokens.space4,
    marginBlockStart: tokens.space2,
    marginInline: tokens.space3,
    paddingBlock: tokens.space2,
    paddingInline: 14,
    width: "calc(100% - 24px)",
    "@media (max-width: 720px)": {
      borderInlineStyle: "none",
      borderRadius: 0,
    },
  },
  state: {
    alignContent: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    gap: tokens.space3,
    justifyItems: "start",
    minHeight: 180,
    padding: 24,
  },
  stateDescription: {
    fontSize: 12,
    lineHeight: "18px",
    margin: 0,
    maxWidth: 460,
  },
  stateTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    margin: 0,
  },
});

export function PluginDetailPage({
  agentId,
  instanceKey,
  packageId,
}: {
  agentId: string;
  instanceKey: string;
  packageId: string;
}) {
  const { agents, selectAgent, selectedAgent } = useAgentIdentity();
  const routedAgent = agents.find((agent) => agent.id === agentId);
  useEffect(() => {
    if (routedAgent && routedAgent.id !== selectedAgent.id) {
      selectAgent(routedAgent.id);
    }
  }, [routedAgent, selectAgent, selectedAgent.id]);

  if (!routedAgent) {
    return (
      <PluginDetailShell instanceKey={instanceKey} packageId={packageId}>
        <DetailState
          action={<BackToPlugins />}
          description="This Agent is no longer available in Console."
          title="Agent unavailable"
        />
      </PluginDetailShell>
    );
  }

  return (
    <AgentPluginDetail
      instanceKey={instanceKey}
      key={`${routedAgent.id}/${packageId}/${instanceKey}`}
      packageId={packageId}
      selectedAgent={routedAgent}
    />
  );
}

function AgentPluginDetail({
  instanceKey,
  packageId,
  selectedAgent,
}: {
  instanceKey: string;
  packageId: string;
  selectedAgent: AgentIdentity;
}) {
  const configurationAvailable = selectedAgent.capabilities.includes(
    AGENT_PLUGIN_CONFIGURATION_CAPABILITY
  );
  const workbench = usePluginWorkbench(
    selectedAgent.id,
    configurationAvailable
  );
  const inventory = workbench.data?.inventory;
  const plugin = workbench.data?.items.find(
    (item) => item.packageId === packageId && item.instanceKey === instanceKey
  );
  const configurationDraftStore = usePluginConfigurationDraftStore();
  const mutation = usePluginMutation(selectedAgent.id, inventory?.streamId);
  const { completeRequest, request } = usePluginAgentWorkbench();
  const appliedRequestId = useRef(0);
  const [workbenchNotice, setWorkbenchNotice] = useState<string | null>(null);

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
    if (!result || result.selectedKey !== `${packageId}/${instanceKey}`) {
      return;
    }
    appliedRequestId.current = request.id;
    setWorkbenchNotice(result.notice);
    completeRequest(request.id);
  }, [
    completeRequest,
    configurationDraftStore,
    instanceKey,
    packageId,
    request,
    selectedAgent.id,
    workbench.data,
  ]);

  return (
    <PluginDetailShell instanceKey={instanceKey} packageId={packageId} withTabs>
      {workbench.isPending ? (
        <DetailState
          description="Reading the active App configuration."
          title="Loading Plugin"
        />
      ) : workbench.configurationAvailable === false ? (
        <DetailState
          action={<BackToPlugins />}
          description={`${selectedAgent.label} does not provide ${AGENT_PLUGIN_CONFIGURATION_CAPABILITY}, so Console cannot read or change its Plugin configuration.`}
          title="Plugin configuration unavailable"
        />
      ) : workbench.isError ? (
        <DetailState
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
          title="Plugin unavailable"
        />
      ) : inventory && workbench.data ? (
        plugin ? (
          <div {...stylex.props(styles.detail)}>
            {workbenchNotice ? (
              <output
                aria-live="polite"
                {...stylex.props(styles.requestNotice)}
              >
                {workbenchNotice}
              </output>
            ) : null}
            <PluginDetail
              agentId={selectedAgent.id}
              authoringEnabled={workbench.authoringEnabled}
              configurationDraftStore={configurationDraftStore}
              inventory={inventory}
              management={workbench.data.management}
              mutation={mutation}
              plugin={plugin}
            />
          </div>
        ) : (
          <DetailState
            action={<BackToPlugins />}
            description="This Plugin instance is no longer present in the current App configuration."
            title="Plugin not found"
          />
        )
      ) : (
        <DetailState
          description="Reading the active App configuration."
          title="Loading Plugin"
        />
      )}
    </PluginDetailShell>
  );
}

function PluginDetailShell({
  children,
  instanceKey,
  packageId,
  withTabs = false,
}: {
  children: ReactNode;
  instanceKey: string;
  packageId: string;
  withTabs?: boolean;
}) {
  const shell = (
    <>
      <PageHeader.Root
        aria-label="Plugin navigation"
        {...stylex.props(styles.header)}
        variant={withTabs ? "team" : "simple"}
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
                <Breadcrumb.Link
                  nativeButton={false}
                  render={<Link to="/plugins" />}
                >
                  Plugins
                </Breadcrumb.Link>
              </Breadcrumb.Item>
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <Breadcrumb.Page>
                  {packageId}/{instanceKey}
                </Breadcrumb.Page>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>
        </PageHeader.Row>
        {withTabs ? (
          <PageHeader.TabsRow>
            <PageHeader.TabsList aria-label="Plugin details">
              <PageHeader.Tab value="configuration">
                Configuration
              </PageHeader.Tab>
              <PageHeader.Tab value="capabilities">Capabilities</PageHeader.Tab>
              <PageHeader.Tab value="technical">
                Technical details
              </PageHeader.Tab>
            </PageHeader.TabsList>
          </PageHeader.TabsRow>
        ) : null}
      </PageHeader.Root>
      <main {...stylex.props(styles.content)}>{children}</main>
    </>
  );

  return withTabs ? (
    <PageHeader.TabsRoot
      data-page="plugin-detail"
      defaultValue="configuration"
      xstyle={styles.page}
    >
      {shell}
    </PageHeader.TabsRoot>
  ) : (
    <div
      data-page="plugin-detail"
      {...stylex.props(styles.page, styles.pageSimple)}
    >
      {shell}
    </div>
  );
}

function DetailState({
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
      <h1 {...stylex.props(styles.stateTitle)}>{title}</h1>
      <p {...stylex.props(styles.stateDescription)}>{description}</p>
      {action}
    </section>
  );
}

function BackToPlugins() {
  return (
    <Button
      nativeButton={false}
      render={<Link to="/plugins" />}
      size="compact"
      variant="secondary"
    >
      Back to Plugins
    </Button>
  );
}
