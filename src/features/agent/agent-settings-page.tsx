import { Button } from "@lenso/ui/button";
import { Select } from "@lenso/ui/select";
import { SettingsRow } from "@lenso/ui/settings-row";
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
import { settingsPageStyles as preferences } from "../settings/settings-page.stylex";
import { useAgentIdentity } from "./agent-identity-context";
import {
  AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
  readAgentBootstrap,
  readAgentContextSources,
  readAgentToolPolicy,
  updateAgentToolPolicy,
  type AgentIdentity,
} from "./agent-runtime";
import { agentSettingsStyles as styles } from "./agent-settings-page.stylex";

export type AgentSettingsKind =
  | "ai"
  | "agent"
  | "personalization"
  | "skill-new";

export function AgentSettingsPage({ kind }: { kind: AgentSettingsKind }) {
  const { selectedAgent } = useAgentIdentity();
  if (kind === "skill-new") {
    return <Navigate replace to="/settings/agent" />;
  }
  return (
    <main {...stylex.props(preferences.page)}>
      {kind === "ai" ? (
        <AiAgentsPage />
      ) : (
        <AgentSettingsContent
          agent={selectedAgent}
          key={selectedAgent.id}
          kind={kind}
        />
      )}
    </main>
  );
}

function SectionHeading({
  description,
  title,
  children,
}: {
  children?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <header {...stylex.props(styles.sectionHeading)}>
      <h1 {...stylex.props(preferences.pageTitle)}>{title}</h1>
      <p {...stylex.props(styles.description, styles.inset)}>{description}</p>
      {children}
    </header>
  );
}

function AgentPicker() {
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

function AiAgentsPage() {
  const { agents, selectAgent } = useAgentIdentity();
  return (
    <div {...stylex.props(preferences.column)}>
      <SectionHeading
        title="AI & Agents"
        description="Configure the Agents available in this Console."
      />
      <Section
        title="Available Agents"
        description="Choose an Agent to manage its settings."
      >
        <ul {...stylex.props(styles.list)}>
          {agents.map((agent) => (
            <li key={agent.id} {...stylex.props(styles.listItem)}>
              <Link
                to="/settings/ai/agent"
                onClick={() => selectAgent(agent.id)}
                {...stylex.props(styles.linkRow)}
              >
                <span>
                  <strong {...stylex.props(styles.rowTitle)}>
                    {agent.label}
                  </strong>
                  <span {...stylex.props(styles.description)}>
                    {agent.role === "console" ? "Built-in" : "App Agent"} ·{" "}
                    {agent.id}
                  </span>
                </span>
                <span {...stylex.props(styles.actionLabel)}>Configure</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AgentSettingsContent({
  agent,
  kind,
}: {
  agent: AgentIdentity;
  kind: "agent" | "personalization";
}) {
  const configurationAvailable = agent.capabilities.includes(
    AGENT_PLUGIN_CONFIGURATION_CAPABILITY
  );
  const workbench = usePluginWorkbench(agent.id, configurationAvailable);
  const items = workbench.data?.items ?? [];
  const personalization = kind === "personalization";
  return (
    <div {...stylex.props(preferences.column)}>
      <Link
        to={personalization ? "/settings/ai/agent" : "/settings/ai"}
        {...stylex.props(styles.backLink)}
      >
        {personalization ? "Agent settings" : "AI & Agents"}
      </Link>
      <SectionHeading
        title={personalization ? "Guidance & integrations" : "Agent settings"}
        description={
          personalization
            ? "Manage this Agent’s instruction sources and integrations."
            : "Manage this Agent’s Tools, providers and storage."
        }
      >
        <SettingsSection.Group xstyle={[preferences.group, styles.agentGroup]}>
          <SettingsRow.Root xstyle={preferences.row}>
            <SettingsRow.Copy>
              <SettingsRow.Title xstyle={preferences.rowTitle}>
                Agent
              </SettingsRow.Title>
              <SettingsRow.Description xstyle={preferences.rowDescription}>
                Choose which Agent to configure.
              </SettingsRow.Description>
            </SettingsRow.Copy>
            <SettingsRow.Control>
              <AgentPicker />
            </SettingsRow.Control>
          </SettingsRow.Root>
        </SettingsSection.Group>
      </SectionHeading>
      <div {...stylex.props(styles.navigation)}>
        <Link
          to={personalization ? "/settings/ai/agent" : "/settings/agent"}
          {...stylex.props(styles.textLink)}
        >
          {personalization ? "Tools & configuration" : "Guidance, skills & MCP"}
        </Link>
        <Link
          to="/agent/$agentId/$chatId"
          params={{ agentId: agent.id, chatId: "new-task" }}
          {...stylex.props(styles.textLink)}
        >
          Open Agent
        </Link>
        <Link to="/plugins" {...stylex.props(styles.textLink)}>
          All Plugins
        </Link>
      </div>
      {configurationAvailable ? (
        workbench.isError ? (
          <p role="alert" {...stylex.props(styles.error)}>
            Plugin settings could not be loaded: {errorMessage(workbench.error)}
          </p>
        ) : workbench.isPending ? (
          <output {...stylex.props(styles.notice)}>
            Loading Plugin settings…
          </output>
        ) : null
      ) : (
        <p {...stylex.props(styles.notice)}>
          This Agent does not expose Plugin configuration. Its Host manages
          these settings.
        </p>
      )}
      {workbench.isDegraded ? (
        <output {...stylex.props(styles.notice)}>
          Plugin settings are refreshing. Configuration availability will be
          checked again when you open a Plugin.
        </output>
      ) : null}
      {configurationAvailable && workbench.data ? (
        personalization ? (
          <>
            <ProviderSection
              agentId={agent.id}
              title="Guidance"
              description="Configure instruction sources and prompt contributions in their owning Plugins."
              empty="No guidance providers are present in this Agent's Plugin inventory."
              items={items.filter((item) =>
                provides(item, "lenso.agent.prompt-provider")
              )}
            />
            <ProviderSection
              agentId={agent.id}
              title="Skills"
              description="Configure skill discovery roots and limits. Edit skill files in their configured source."
              empty="No filesystem Skills Plugin is present in this Agent's Plugin inventory."
              items={items.filter(
                (item) => item.packageId === "lenso.agent.skills.filesystem"
              )}
            />
            <ProviderSection
              agentId={agent.id}
              title="MCP connectors"
              description="Configure each MCP client instance, including its transport, credentials reference and roots."
              empty="No MCP client instances are present in this Agent's Plugin inventory."
              items={items.filter(
                (item) => item.packageId === "lenso.agent.mcp-client"
              )}
            />
            <ProviderSection
              agentId={agent.id}
              title="Context sources"
              description="Plugins that expose reusable prompts and resources to this Agent."
              empty="No context-source providers are present in this Agent's Plugin inventory."
              items={items.filter((item) =>
                provides(item, "lenso.agent.context-source")
              )}
            />
          </>
        ) : (
          <>
            <ProviderSection
              agentId={agent.id}
              title="Models & authentication"
              description="Configure model providers, selection policies and authentication through their Plugins."
              empty="No model or authentication providers are present in this Agent's Plugin inventory."
              items={items.filter(
                (item) =>
                  provides(item, "lenso.agent.model") ||
                  provides(item, "lenso.agent.model-selection") ||
                  provides(item, "lenso.agent.auth.openai-codex") ||
                  provides(item, "lenso.agent.oauth-access")
              )}
            />
            <ProviderSection
              agentId={agent.id}
              title="Sessions & memory"
              description="Configure storage and retention in the providers that own this Agent's data."
              empty="No session or memory providers are present in this Agent's Plugin inventory."
              items={items.filter(
                (item) =>
                  provides(item, "lenso.agent.session") ||
                  provides(item, "lenso.agent.memory")
              )}
            />
          </>
        )
      ) : null}
      {personalization ? (
        <ContextCatalog agent={agent} />
      ) : (
        <ToolAccess agent={agent} />
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
                    {item.packageId}
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
        <p {...stylex.props(styles.notice)}>{empty}</p>
      )}
    </Section>
  );
}

function ContextCatalog({ agent }: { agent: AgentIdentity }) {
  const bootstrap = useQuery({
    queryKey: ["agent-settings", agent.id, "bootstrap"],
    queryFn: ({ signal }) => readAgentBootstrap(signal, agent.id),
    retry: false,
  });
  const catalog = useQuery({
    queryKey: ["agent-settings", agent.id, "context"],
    queryFn: ({ signal }) => readAgentContextSources(signal, agent.id),
    enabled: Boolean(bootstrap.data?.capabilities.contextSources),
    retry: false,
  });
  const [search, setSearch] = useState("");
  const entries = [
    ...(catalog.data?.prompts.map((prompt) => ({
      ...prompt,
      key: `prompt:${prompt.source}:${prompt.name}`,
      kind: "Prompt",
    })) ?? []),
    ...(catalog.data?.resources.map((resource) => ({
      ...resource,
      key: `resource:${resource.source}:${resource.uri}`,
      kind: "Resource",
    })) ?? []),
  ];
  const filtered = entries.filter((entry) =>
    `${entry.name} ${entry.description} ${entry.source}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase())
  );
  return (
    <Section
      title="Available prompts & resources"
      description="Prompts and resources currently exposed by the selected Agent."
    >
      {bootstrap.error || catalog.error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {errorMessage(bootstrap.error ?? catalog.error)}
        </p>
      ) : bootstrap.isPending ||
        (bootstrap.data?.capabilities.contextSources && catalog.isPending) ? (
        <output {...stylex.props(styles.notice)}>
          Loading context catalog…
        </output>
      ) : bootstrap.data?.capabilities.contextSources ? (
        <>
          {entries.length > 0 ? (
            <TextField.Root size="compact" xstyle={styles.search}>
              <TextField.Control
                type="search"
                aria-label="Filter prompts and resources"
                placeholder="Filter prompts and resources…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </TextField.Root>
          ) : null}
          <ul {...stylex.props(styles.list)}>
            {filtered.map((entry) => (
              <li key={entry.key} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowCopy)}>
                  <strong {...stylex.props(styles.rowTitle)}>
                    {entry.name}
                  </strong>
                  <span {...stylex.props(styles.description)}>
                    {entry.description}
                  </span>
                  <span {...stylex.props(styles.description)}>
                    {entry.source}
                  </span>
                </span>
                <span {...stylex.props(styles.actionLabel)}>{entry.kind}</span>
              </li>
            ))}
          </ul>
          {filtered.length === 0 ? (
            <p {...stylex.props(styles.notice)}>
              {entries.length
                ? "No matching prompts or resources."
                : "No prompts or resources are currently exposed."}
            </p>
          ) : null}
        </>
      ) : (
        <p {...stylex.props(styles.notice)}>
          This Agent does not expose a context catalog.
        </p>
      )}
    </Section>
  );
}

function ToolAccess({ agent }: { agent: AgentIdentity }) {
  const queryClient = useQueryClient();
  const canManage = agent.role === "console";
  const policyKey = ["agent-settings", agent.id, "tool-policy"];
  const bootstrapKey = ["agent-settings", agent.id, "bootstrap"];
  const bootstrap = useQuery({
    queryKey: bootstrapKey,
    queryFn: ({ signal }) => readAgentBootstrap(signal, agent.id),
    retry: false,
  });
  const policy = useQuery({
    queryKey: policyKey,
    queryFn: ({ signal }) => readAgentToolPolicy(signal),
    enabled: canManage,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: updateAgentToolPolicy,
    onSuccess: (updated) => {
      queryClient.setQueryData(policyKey, updated);
      void queryClient.invalidateQueries({ queryKey: bootstrapKey });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: policyKey });
    },
  });
  const tools = policy.data ?? bootstrap.data?.tools;
  const allowedTools = new Set(tools?.allowed);
  return (
    <Section
      title="Tool access"
      description={
        canManage
          ? "Choose which Tools the Console Agent may use. Changes apply to new turns."
          : "The effective Tool access for this Agent. Its Host owns policy changes; Console does not proxy Host control."
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
            {tools.allowed.length} enabled · {tools.available.length} available
            {bootstrap.data ? ` · Profile: ${bootstrap.data.profile}` : ""}
          </p>
          <ul {...stylex.props(styles.list)}>
            {tools.available.map((tool) => (
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
                    disabled={
                      mutation.isPending || policy.isFetching || policy.isError
                    }
                    layout="control-only"
                    onCheckedChange={(checked) => {
                      if (!policy.data || mutation.isPending) {
                        return;
                      }
                      mutation.mutate({
                        allowed: checked
                          ? [
                              ...new Set([...policy.data.allowed, tool.name]),
                            ].sort()
                          : policy.data.allowed.filter(
                              (name) => name !== tool.name
                            ),
                        expectedRevision: policy.data.revision,
                      });
                    }}
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
