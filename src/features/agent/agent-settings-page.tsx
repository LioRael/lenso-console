import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Surface } from "@lenso/ui/surface";
import { Switch } from "@lenso/ui/switch";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Box,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Code2,
  Network,
  Plus,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import { SettingsSection } from "../../components/lenso/recipes/settings-section";
import {
  readAgentBootstrap,
  readAgentToolPolicy,
  updateAgentToolPolicy,
  type AgentBootstrap,
  type AgentToolPolicy,
} from "./agent-runtime";
import { agentSettingsStyles as styles } from "./agent-settings-page.stylex";

export type AgentSettingsKind =
  | "ai"
  | "agent"
  | "personalization"
  | "skill-new";

export function AgentSettingsPage({ kind }: { kind: AgentSettingsKind }) {
  return (
    <main {...stylex.props(styles.page)}>
      {kind === "personalization" ? <PersonalizationPage /> : null}
      {kind === "skill-new" ? <SkillEditorPage /> : null}
      {kind === "ai" ? <AiAgentsPage /> : null}
      {kind === "agent" ? <AgentConfigurationPage /> : null}
    </main>
  );
}

function SectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <header {...stylex.props(styles.sectionHeading)}>
      <h1 {...stylex.props(styles.sectionHeadingTitle)}>{title}</h1>
      <p {...stylex.props(styles.sectionHeadingDescription)}>{description}</p>
    </header>
  );
}

function PersonalizationPage() {
  const navigate = useNavigate();
  const [guidance, setGuidance] = useState("");
  return (
    <div {...stylex.props(styles.contentColumn)}>
      <SectionHeading
        description="Your personal settings for Lenso Agent"
        title="Agent personalization"
      />
      <SettingsSection.Root
        aria-labelledby="personal-guidance-title"
        xstyle={styles.sectionRoot}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title
            xstyle={styles.sectionTitle}
            id="personal-guidance-title"
          >
            Guidance
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Provide personal instructions and context for Lenso Agent when
            responding to conversations
          </SettingsSection.Description>
        </SettingsSection.Header>
        <textarea
          aria-label="Agent guidance"
          {...stylex.props(styles.guidance)}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Enter personal guidance for Lenso Agent (optional)…"
          value={guidance}
        />
      </SettingsSection.Root>
      <SettingsSection.Root
        aria-labelledby="skills-title"
        xstyle={[styles.sectionRoot, styles.sectionRootFollowing]}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title xstyle={styles.sectionTitle} id="skills-title">
            Skills
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Reusable prompts auto-selected by the agent or invoked via slash
            commands
          </SettingsSection.Description>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={styles.singleRow}>
          <div {...stylex.props(styles.singleRowInner)}>
            <span>No skills created</span>
            <IconButton
              aria-label="Create skill"
              onClick={() => navigate({ to: "/settings/agent/skills/new" })}
              size="compact"
              variant="ghost"
            >
              <Plus size={14} />
            </IconButton>
          </div>
        </SettingsSection.Group>
      </SettingsSection.Root>
      <SettingsSection.Root
        aria-labelledby="mcp-connectors-title"
        xstyle={[styles.sectionRoot, styles.sectionRootFollowing]}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title
            xstyle={styles.sectionTitle}
            id="mcp-connectors-title"
          >
            MCP connectors
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Add MCP connectors for use with Lenso Agent. Workspace admins can
            manage available connectors in security settings.
          </SettingsSection.Description>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={styles.singleRow}>
          <div {...stylex.props(styles.singleRowInner)}>
            <span>Agent MCP access disabled in this workspace</span>
            <Button size="compact" variant="ghost">
              Configure
            </Button>
          </div>
        </SettingsSection.Group>
      </SettingsSection.Root>
    </div>
  );
}

function SkillEditorPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  return (
    <div {...stylex.props(styles.contentColumn, styles.skillEditor)}>
      <Link
        className={stylex.props(styles.backLink).className}
        to="/settings/agent"
      >
        <ArrowLeft size={14} /> Agent personalization
      </Link>
      <input
        aria-label="Skill name"
        {...stylex.props(styles.skillName)}
        onChange={(event) => setName(event.target.value)}
        placeholder="Skill name"
        value={name}
      />
      <textarea
        aria-label="Skill instructions"
        {...stylex.props(styles.skillInstructions)}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Add instructions…"
        value={instructions}
      />
      <div {...stylex.props(styles.editorActions)}>
        <Button
          onClick={() => navigate({ to: "/settings/agent" })}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button
          disabled={!name.trim()}
          onClick={() => navigate({ to: "/settings/agent" })}
          variant="primary"
        >
          Create
        </Button>
      </div>
    </div>
  );
}

function AiAgentsPage() {
  return (
    <div {...stylex.props(styles.contentColumn)}>
      <SectionHeading
        description="Automate product workflows and operations with AI"
        title="AI & Agents"
      />
      <div {...stylex.props(styles.summaryCards)}>
        <SettingsLinkRow
          icon={<CircleDollarSign size={16} />}
          subtitle="$0.00 remaining"
          title="Usage"
        />
        <SettingsLinkRow
          action="Start free trial"
          icon={<Sparkles size={16} />}
          subtitle="Code Intelligence and Loops are available on Business plans"
          title="AI & Agents"
        />
      </div>
      <SettingsSection.Root
        aria-labelledby="lenso-agent-settings-title"
        xstyle={styles.sectionRoot}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title
            xstyle={styles.sectionTitle}
            id="lenso-agent-settings-title"
          >
            Lenso Agent
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Create Apps and answer questions about your workspace.
          </SettingsSection.Description>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={styles.featureList}>
          <Link
            className={stylex.props(styles.featureRow).className}
            to="/settings/ai/agent"
          >
            <Bot size={16} />
            <span>
              <strong {...stylex.props(styles.rowTitle)}>Lenso Agent</strong>
              <small {...stylex.props(styles.rowDescription)}>
                Configure for your workspace
              </small>
            </span>
            <em {...stylex.props(styles.rowStatus)}>Enabled</em>
            <ChevronRight size={14} />
          </Link>
          <FeatureRow
            disabled
            icon={<Code2 size={16} />}
            status="Available later"
            subtitle="Assign or ask Lenso to make code changes"
            title="Coding sessions"
          />
          <FeatureRow
            disabled
            icon={<Network size={16} />}
            status="Available later"
            subtitle="Automated agent workflows triggered by App activity"
            title="Loops"
          />
          <FeatureRow
            disabled
            icon={<Braces size={16} />}
            status="Available later"
            subtitle="Allow Lenso Agent to answer questions about your code"
            title="Code Intelligence"
          />
        </SettingsSection.Group>
      </SettingsSection.Root>
      <SettingsSection.Root
        aria-labelledby="lenso-agent-integrations-title"
        xstyle={[styles.sectionRoot, styles.sectionRootFollowing]}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title
            xstyle={styles.sectionTitle}
            id="lenso-agent-integrations-title"
          >
            Lenso Agent integrations
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Integrations available to Lenso Agent.
          </SettingsSection.Description>
        </SettingsSection.Header>
        <SettingsLinkRow
          grouped
          icon={<Box size={16} />}
          subtitle="Add connectors to your workspace for Agent use"
          title="Available integrations"
        />
      </SettingsSection.Root>
    </div>
  );
}

function AgentConfigurationPage() {
  const canManageToolPolicy = true;
  const [guidance, setGuidance] = useState("");
  const [runtime, setRuntime] = useState<AgentBootstrap>();
  const [toolPolicy, setToolPolicy] = useState<AgentToolPolicy>();
  const [toolPolicyError, setToolPolicyError] = useState<string>();
  const [savingTool, setSavingTool] = useState<string>();
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadRuntimePolicy = async () => {
      try {
        const policyRequest = canManageToolPolicy
          ? settleAgentToolPolicy(controller.signal)
          : undefined;
        const bootstrap = await readAgentBootstrap(controller.signal);
        setRuntime(bootstrap);
        setRuntimeUnavailable(false);
        if (policyRequest) {
          const result = await policyRequest;
          if ("policy" in result) {
            setToolPolicy(result.policy);
            setToolPolicyError(undefined);
          } else if (!controller.signal.aborted) {
            setToolPolicyError(
              result.error instanceof Error
                ? result.error.message
                : "Tool policy is unavailable"
            );
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setRuntimeUnavailable(true);
        }
      }
    };
    void loadRuntimePolicy();
    return () => controller.abort();
  }, []);

  const setToolEnabled = async (toolName: string, enabled: boolean) => {
    if (!toolPolicy || savingTool) {
      return;
    }
    const allowed = enabled
      ? [...new Set([...toolPolicy.allowed, toolName])].sort()
      : toolPolicy.allowed.filter((name) => name !== toolName);
    setSavingTool(toolName);
    setToolPolicyError(undefined);
    try {
      const updated = await updateAgentToolPolicy({
        allowed,
        expectedRevision: toolPolicy.revision,
      });
      setToolPolicy(updated);
      setRuntime((current) =>
        current
          ? {
              ...current,
              tools: { ...current.tools, allowed: updated.allowed },
            }
          : current
      );
    } catch (error) {
      setToolPolicyError(
        error instanceof Error ? error.message : "Tool policy update failed"
      );
    } finally {
      setSavingTool(undefined);
    }
  };

  const effectiveTools = toolPolicy ?? runtime?.tools;

  return (
    <div {...stylex.props(styles.contentColumn)}>
      <Link
        className={stylex.props(styles.backLink).className}
        to="/settings/ai"
      >
        <ArrowLeft size={14} /> AI & Agents
      </Link>
      <SectionHeading
        description="Create Apps and answer questions about your workspace"
        title="Lenso Agent"
      />
      <SettingsSection.Root
        aria-labelledby="tool-access-title"
        xstyle={styles.sectionRoot}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title
            xstyle={styles.sectionTitle}
            id="tool-access-title"
          >
            Tool access
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Choose which Tools the Console Agent may use. Changes apply to new
            turns.
          </SettingsSection.Description>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={styles.toolPolicy}>
          <div {...stylex.props(styles.toolPolicySummary)}>
            <span>
              <strong {...stylex.props(styles.rowTitle)}>
                {runtimeUnavailable
                  ? "Runtime unavailable"
                  : effectiveTools
                    ? `${effectiveTools.allowed.length} ${effectiveTools.allowed.length === 1 ? "tool" : "tools"} enabled`
                    : "Loading runtime policy…"}
              </strong>
              <small {...stylex.props(styles.rowDescription)}>
                {runtime && effectiveTools
                  ? `${effectiveTools.available.length} available · Profile: ${runtime.profile}`
                  : "Reading the effective Harness policy"}
              </small>
            </span>
          </div>
          {effectiveTools?.available.length ? (
            <ul {...stylex.props(styles.toolList)}>
              {effectiveTools.available.map((tool) => (
                <li {...stylex.props(styles.toolListRow)} key={tool.name}>
                  <span>
                    <code {...stylex.props(styles.toolCode)}>{tool.name}</code>
                    <small {...stylex.props(styles.toolDescription)}>
                      {tool.description}
                    </small>
                  </span>
                  {canManageToolPolicy && toolPolicy ? (
                    <Switch.Root
                      aria-label={`Allow ${tool.name}`}
                      checked={toolPolicy.allowed.includes(tool.name)}
                      disabled={Boolean(savingTool)}
                      onCheckedChange={(checked) =>
                        void setToolEnabled(tool.name, checked)
                      }
                      size="default"
                    >
                      <Switch.Thumb />
                    </Switch.Root>
                  ) : (
                    <em {...stylex.props(styles.toolDescription)}>
                      {effectiveTools.allowed.includes(tool.name)
                        ? "Enabled"
                        : "Not enabled"}
                    </em>
                  )}
                </li>
              ))}
            </ul>
          ) : effectiveTools ? (
            <p {...stylex.props(styles.noTools)}>
              This Console Agent cannot call Tools.
            </p>
          ) : null}
          {toolPolicyError ? (
            <p {...stylex.props(styles.toolPolicyError)} role="alert">
              {toolPolicyError}
            </p>
          ) : null}
        </SettingsSection.Group>
      </SettingsSection.Root>
      <SettingsSection.Root
        aria-labelledby="workspace-guidance-title"
        xstyle={[styles.sectionRoot, styles.sectionRootFollowing]}
      >
        <SettingsSection.Header xstyle={styles.sectionHeader}>
          <SettingsSection.Title
            xstyle={styles.sectionTitle}
            id="workspace-guidance-title"
          >
            Workspace guidance
          </SettingsSection.Title>
          <SettingsSection.Description xstyle={styles.sectionDescription}>
            Provide instructions and context for Lenso Agent when responding to
            conversations
          </SettingsSection.Description>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={styles.singleRow}>
          <div {...stylex.props(styles.singleRowInner)}>
            <span {...stylex.props(styles.rowWithIcon)}>
              <CheckCircle2 size={15} />{" "}
              <span>
                <strong {...stylex.props(styles.rowTitle)}>Updates</strong>
                <small {...stylex.props(styles.rowDescription)}>
                  Customize how project updates should be written
                </small>
              </span>
            </span>
            <ChevronRight size={14} />
          </div>
        </SettingsSection.Group>
        <textarea
          aria-label="Workspace guidance"
          {...stylex.props(styles.guidance)}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Optional agent guidance…"
          value={guidance}
        />
      </SettingsSection.Root>
    </div>
  );
}

async function settleAgentToolPolicy(signal: AbortSignal) {
  try {
    return { policy: await readAgentToolPolicy(signal) };
  } catch (error) {
    return { error };
  }
}

function SettingsLinkRow({
  action,
  grouped = false,
  icon,
  subtitle,
  title,
}: {
  action?: string;
  grouped?: boolean;
  icon: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  const content = (
    <div {...stylex.props(styles.singleRowInner)}>
      <span {...stylex.props(styles.rowWithIcon)}>
        {icon}
        <span>
          <strong {...stylex.props(styles.rowTitle)}>{title}</strong>
          <small {...stylex.props(styles.rowDescription)}>{subtitle}</small>
        </span>
      </span>
      {action ? (
        <Button size="compact" variant="secondary">
          {action}
        </Button>
      ) : (
        <ChevronRight size={14} />
      )}
    </div>
  );

  return grouped ? (
    <SettingsSection.Group xstyle={styles.singleRow}>
      {content}
    </SettingsSection.Group>
  ) : (
    <Surface level="panel" xstyle={styles.singleRow}>
      {content}
    </Surface>
  );
}

function FeatureRow({
  disabled,
  icon,
  status,
  subtitle,
  title,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  status: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div
      {...stylex.props(
        styles.featureRow,
        disabled && styles.featureRowDisabled
      )}
      data-disabled={disabled || undefined}
    >
      {icon}
      <span>
        <strong {...stylex.props(styles.rowTitle)}>{title}</strong>
        <small {...stylex.props(styles.rowDescription)}>{subtitle}</small>
      </span>
      <em {...stylex.props(styles.rowStatus)}>{status}</em>
    </div>
  );
}
