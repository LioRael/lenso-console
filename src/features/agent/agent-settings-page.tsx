import { Button } from "@lenso/ui/button";
import { Select } from "@lenso/ui/select";
import { Switch } from "@lenso/ui/switch";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { SettingsSection } from "../../components/lenso/recipes/settings-section";
import {
  pluginKey,
  type PluginWorkbenchItem,
} from "../plugins/plugin-workbench-model";
import { usePluginWorkbench } from "../plugins/use-plugin-workbench";
import { SettingsPageHeader } from "../settings/settings-page-header";
import { settingsPageStyles as preferences } from "../settings/settings-page.stylex";
import { AddMcpConnection } from "./add-mcp-connection";
import { useAgentIdentity } from "./agent-identity-context";
import {
  AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
  readAgentBootstrap,
  readAgentToolPolicy,
  updateAgentToolPolicy,
  type AgentIdentity,
} from "./agent-runtime";
import { agentSettingsStyles as styles } from "./agent-settings-page.stylex";
import { AuthConnections } from "./auth-connections";

export type AgentSettingsKind =
  | "ai"
  | "agent"
  | "personalization"
  | "skill-new";

export function AgentSettingsPage({ kind }: { kind: AgentSettingsKind }) {
  const { selectedAgent } = useAgentIdentity();
  if (kind === "personalization" || kind === "skill-new") {
    return <Navigate replace to="/settings/profiles" />;
  }
  return (
    <main {...stylex.props(preferences.page)}>
      <AgentSettingsContent
        agent={selectedAgent}
        key={selectedAgent.id}
        advanced={kind === "agent"}
      />
    </main>
  );
}

export function AgentPicker() {
  const { agents, selectedAgent, selectAgent } = useAgentIdentity();
  return (
    <Select.Root
      value={selectedAgent.id}
      onValueChange={(value) => {
        if (typeof value === "string") {
          selectAgent(value);
        }
      }}
    >
      <Select.Trigger
        aria-label="Agent settings target"
        xstyle={[preferences.selectTrigger, styles.agentPicker]}
      >
        <Select.Value>{selectedAgent.label}</Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" position="popper">
          <Select.Popup>
            <Select.List>
              {agents.map((agent) => (
                <Select.Item key={agent.id} value={agent.id}>
                  <Select.ItemText>{agent.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function AgentSettingsContent({
  agent,
  advanced,
}: {
  agent: AgentIdentity;
  advanced: boolean;
}) {
  const configurationAvailable = agent.capabilities.includes(
    AGENT_PLUGIN_CONFIGURATION_CAPABILITY
  );
  const workbench = usePluginWorkbench(
    agent.id,
    configurationAvailable && !advanced
  );
  const items = workbench.data?.items ?? [];
  return (
    <div {...stylex.props(preferences.column)}>
      {advanced ? (
        <Link to="/settings/connections" {...stylex.props(styles.backLink)}>
          Connections
        </Link>
      ) : null}
      <SettingsPageHeader
        title={advanced ? "Global tool restrictions" : "Connections"}
        description={
          advanced
            ? "Advanced limits for every Profile of this Agent. A Profile cannot override these restrictions."
            : "Connect model services and external tools. Choose what to use in Profiles."
        }
        actions={<AgentPicker />}
      />
      {advanced ? (
        <ToolAccess agent={agent} />
      ) : (
        <>
          {agent.capabilities.includes("lenso.agent.auth-connection@1") ? (
            <AuthConnections agentId={agent.id} />
          ) : null}
          {workbench.isError ? (
            <p role="alert" {...stylex.props(styles.error)}>
              Connections could not be loaded: {errorMessage(workbench.error)}
            </p>
          ) : null}
          {configurationAvailable && workbench.isPending ? (
            <output {...stylex.props(styles.notice)}>
              Loading connections…
            </output>
          ) : null}
          {workbench.data ? (
            <>
              {agent.capabilities.includes(
                "lenso.agent.auth-connection@1"
              ) ? null : (
                <ProviderSection
                  agentId={agent.id}
                  title="Accounts"
                  description="Manage sign-in through the account provider's configuration."
                  empty="No account providers are available for this Agent."
                  items={items.filter((item) =>
                    provides(item, "lenso.agent.auth-connection")
                  )}
                />
              )}
              <ProviderSection
                agentId={agent.id}
                title="Model services"
                description="Configure service endpoints and credentials in their Plugins."
                empty="No model services are available for this Agent."
                items={items.filter((item) =>
                  provides(item, "lenso.agent.model")
                )}
              />
              <AddMcpConnection
                agentId={agent.id}
                data={workbench.data}
                onAdded={() => {
                  void workbench.refetch();
                }}
              />
              <ProviderSection
                agentId={agent.id}
                title="MCP connections"
                description="Configure external servers here, then enable their capabilities in a Profile."
                empty="No MCP connections are available for this Agent."
                items={items.filter((item) =>
                  /(^|[._-])mcp([._-]|$)/u.test(item.packageId)
                )}
              />
            </>
          ) : null}
          <Section
            title="Advanced"
            description="Limits that apply across all Profiles of the selected Agent."
          >
            <Link to="/settings/ai/agent" {...stylex.props(styles.linkRow)}>
              <span {...stylex.props(styles.rowCopy)}>
                <strong {...stylex.props(styles.rowTitle)}>
                  Global tool restrictions
                </strong>
                <span {...stylex.props(styles.description)}>
                  Set the maximum tool access. Configure everyday tool choices
                  in Profiles.
                </span>
              </span>
              <span {...stylex.props(styles.actionLabel)}>Manage</span>
            </Link>
          </Section>
        </>
      )}
    </div>
  );
}

function provides(item: PluginWorkbenchItem, capability: string) {
  return [item.active, item.desired, item.preparing].some((selection) =>
    selection?.providedCapabilities.some((id) =>
      id.startsWith(`${capability}@`)
    )
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <SettingsSection.Root xstyle={[preferences.section, styles.sectionRoot]}>
      <SettingsSection.Header xstyle={styles.sectionHeader}>
        <SettingsSection.Title xstyle={preferences.sectionTitle}>
          {title}
        </SettingsSection.Title>
        <SettingsSection.Description
          xstyle={[styles.description, styles.inset]}
        >
          {description}
        </SettingsSection.Description>
      </SettingsSection.Header>
      <div {...stylex.props(preferences.group, styles.sectionBody)}>
        {children}
      </div>
    </SettingsSection.Root>
  );
}

function connectionLabel(packageId: string) {
  const labels: Record<string, string> = {
    "lenso.agent.auth.openai-codex": "OpenAI Codex account",
    "lenso.agent.model.openai-codex-direct": "OpenAI Codex",
    "lenso.agent.model.openai-compatible": "OpenAI-compatible service",
    "lenso.agent.mcp-client": "MCP server",
  };
  return (
    labels[packageId] ??
    packageId.replace(/^lenso\.agent\./u, "").replaceAll(/[._-]/gu, " ")
  );
}

function ProviderSection({
  agentId,
  title,
  description,
  empty,
  items,
}: {
  agentId: string;
  title: string;
  description: string;
  empty: string;
  items: readonly PluginWorkbenchItem[];
}) {
  return (
    <Section title={title} description={description}>
      {items.length ? (
        <ul {...stylex.props(styles.list)}>
          {items.map((item) => (
            <li key={pluginKey(item)} {...stylex.props(styles.listItem)}>
              <Link
                to="/plugins/$agentId/$packageId/$instanceKey"
                params={{
                  agentId,
                  packageId: item.packageId,
                  instanceKey: item.instanceKey,
                }}
                {...stylex.props(styles.linkRow)}
              >
                <span {...stylex.props(styles.rowCopy)}>
                  <strong {...stylex.props(styles.rowTitle)}>
                    {connectionLabel(item.packageId)}
                  </strong>
                  <span {...stylex.props(styles.description)}>
                    {item.instanceKey} ·{" "}
                    {item.active
                      ? "Active"
                      : item.desired
                        ? "In desired Plan"
                        : "Not active"}
                  </span>
                </span>
                <span {...stylex.props(styles.actionLabel)}>Configure</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p {...stylex.props(styles.notice)}>
          {empty} <Link to="/plugins">Manage Plugins</Link>
        </p>
      )}
    </Section>
  );
}

export function ToolAccess({ agent }: { agent: AgentIdentity }) {
  const queryClient = useQueryClient();
  const canManage = agent.capabilities.includes(
    AGENT_PLUGIN_CONFIGURATION_CAPABILITY
  );
  const policyKey = ["agent-settings", agent.id, "tool-policy"];
  const bootstrapKey = ["agent-settings", agent.id, "bootstrap"];
  const bootstrap = useQuery({
    queryKey: bootstrapKey,
    queryFn: ({ signal }) => readAgentBootstrap(signal, agent.id),
    retry: false,
  });
  const policy = useQuery({
    queryKey: policyKey,
    queryFn: ({ signal }) => readAgentToolPolicy(signal, agent.id),
    enabled: canManage,
    retry: false,
  });
  const [draft, setDraft] = useState<{ allowed: string[]; revision: number }>();
  const [search, setSearch] = useState("");
  const mutation = useMutation({
    mutationFn: (request: { allowed: string[]; expectedRevision: number }) =>
      updateAgentToolPolicy({ ...request, targetId: agent.id }),
    onSuccess: (updated) => {
      queryClient.setQueryData(policyKey, updated);
      setDraft(undefined);
      void queryClient.invalidateQueries({ queryKey: bootstrapKey });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: policyKey });
    },
  });
  const tools = policy.data ?? bootstrap.data?.tools;
  const allowedTools = new Set(draft?.allowed ?? tools?.allowed);
  const stale = Boolean(
    draft && policy.data && draft.revision !== policy.data.revision
  );
  const disabled =
    mutation.isPending || policy.isFetching || policy.isError || stale;
  const edit = (allowed: string[]) => {
    if (!policy.data || disabled) {
      return;
    }
    mutation.reset();
    setDraft({
      allowed: [...new Set(allowed)].sort(),
      revision: policy.data.revision,
    });
  };
  const changed = Boolean(
    draft &&
    [...allowedTools].sort().join("\n") !==
      [...(policy.data?.allowed ?? [])].sort().join("\n")
  );
  const filteredTools =
    tools?.available.filter((tool) =>
      `${tool.name} ${tool.description}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
    ) ?? [];
  return (
    <Section
      title="Tool restrictions"
      description={
        canManage
          ? "Allowed tools form the upper limit for all Profiles of this Agent. Changes apply to new turns."
          : "The effective Tool access for this Agent. Its Host has not enabled policy management through Console."
      }
    >
      {bootstrap.error || policy.error || mutation.error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {errorMessage(mutation.error ?? policy.error ?? bootstrap.error)}
        </p>
      ) : null}
      {tools ? (
        <>
          <p {...stylex.props(styles.notice)}>
            {allowedTools.size} allowed · {tools.available.length} available
          </p>
          <div {...stylex.props(styles.toolToolbar)}>
            <TextField.Root size="compact" xstyle={styles.toolSearch}>
              <TextField.Control
                type="search"
                aria-label="Filter tools"
                placeholder="Filter tools…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </TextField.Root>
            {canManage && policy.data ? (
              <>
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    edit([
                      ...allowedTools,
                      ...tools.available.map((tool) => tool.name),
                    ])
                  }
                >
                  Enable all
                </Button>
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => edit([])}
                >
                  Disable all
                </Button>
              </>
            ) : null}
          </div>
          {stale ? (
            <p role="alert" {...stylex.props(styles.notice)}>
              Tool access changed elsewhere. Reset your draft to load the latest
              policy.
            </p>
          ) : null}
          <ul {...stylex.props(styles.toolList)}>
            {filteredTools.map((tool) => (
              <li key={tool.name} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowCopy)}>
                  <strong {...stylex.props(styles.rowTitle)}>
                    {tool.name}
                  </strong>
                  <span {...stylex.props(styles.description)}>
                    {tool.description}
                  </span>
                </span>
                {canManage && policy.data ? (
                  <Switch.Root
                    aria-label={`Allow ${tool.name}`}
                    checked={allowedTools.has(tool.name)}
                    disabled={disabled}
                    layout="control-only"
                    onCheckedChange={(checked) =>
                      edit(
                        checked
                          ? [...allowedTools, tool.name]
                          : [...allowedTools].filter(
                              (name) => name !== tool.name
                            )
                      )
                    }
                  >
                    <Switch.Thumb />
                  </Switch.Root>
                ) : (
                  <span {...stylex.props(styles.actionLabel)}>
                    {allowedTools.has(tool.name) ? "Enabled" : "Not enabled"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {tools.available.length > 0 && filteredTools.length === 0 ? (
            <p {...stylex.props(styles.notice)}>No matching tools.</p>
          ) : null}
          {canManage && policy.data ? (
            <div {...stylex.props(styles.saveBar)}>
              <span {...stylex.props(styles.description)}>
                {changed ? "Unsaved changes" : "Changes are saved explicitly."}
              </span>
              <Button
                size="compact"
                variant="ghost"
                disabled={!draft || mutation.isPending}
                onClick={() => {
                  setDraft(undefined);
                  mutation.reset();
                }}
              >
                Reset
              </Button>
              <Button
                size="compact"
                disabled={!changed || disabled}
                onClick={() => {
                  if (draft && !disabled) {
                    mutation.mutate({
                      allowed: draft.allowed,
                      expectedRevision: draft.revision,
                    });
                  }
                }}
              >
                {mutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : null}
          {tools.available.length ? null : (
            <p {...stylex.props(styles.notice)}>
              No Tools are exposed by this Agent.
            </p>
          )}
        </>
      ) : bootstrap.isPending ? (
        <output {...stylex.props(styles.notice)}>Loading Tool access…</output>
      ) : null}
      {mutation.isSuccess ? (
        <output {...stylex.props(styles.notice)}>Tool access saved.</output>
      ) : null}
      {bootstrap.error || policy.error ? (
        <Button
          size="compact"
          variant="secondary"
          xstyle={styles.retry}
          onClick={() => {
            void bootstrap.refetch();
            if (canManage) {
              void policy.refetch();
            }
          }}
        >
          Retry
        </Button>
      ) : null}
    </Section>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The Agent is unavailable. Try again after reconnecting.";
}
