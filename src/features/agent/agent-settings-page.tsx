import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Surface } from "@lenso/ui/surface";
import { Switch } from "@lenso/ui/switch";
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

import {
  readAgentBootstrap,
  readAgentToolPolicy,
  updateAgentToolPolicy,
  type AgentBootstrap,
  type AgentToolPolicy,
} from "./agent-runtime";

import styles from "./agent-settings-page.module.css";

export type AgentSettingsKind =
  | "ai"
  | "agent"
  | "personalization"
  | "skill-new";

export function AgentSettingsPage({ kind }: { kind: AgentSettingsKind }) {
  return (
    <main className={styles.page}>
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
    <header className={styles.sectionHeading}>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function PersonalizationPage() {
  const navigate = useNavigate();
  const [guidance, setGuidance] = useState("");
  return (
    <div className={styles.contentColumn}>
      <SectionHeading
        description="Your personal settings for Lenso Agent"
        title="Agent personalization"
      />
      <SettingsSection
        description="Provide personal instructions and context for Lenso Agent when responding to conversations"
        title="Guidance"
      >
        <textarea
          aria-label="Agent guidance"
          className={styles.guidance}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Enter personal guidance for Lenso Agent (optional)…"
          value={guidance}
        />
      </SettingsSection>
      <SettingsSection
        description="Reusable prompts auto-selected by the agent or invoked via slash commands"
        title="Skills"
      >
        <Surface className={styles.singleRow} level="panel">
          <div className={styles.singleRowInner}>
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
        </Surface>
      </SettingsSection>
      <SettingsSection
        description="Add MCP connectors for use with Lenso Agent. Workspace admins can manage available connectors in security settings."
        title="MCP connectors"
      >
        <Surface className={styles.singleRow} level="panel">
          <div className={styles.singleRowInner}>
            <span>Agent MCP access disabled in this workspace</span>
            <Button size="compact" variant="ghost">
              Configure
            </Button>
          </div>
        </Surface>
      </SettingsSection>
    </div>
  );
}

function SkillEditorPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  return (
    <div className={`${styles.contentColumn} ${styles.skillEditor}`}>
      <Link className={styles.backLink} to="/settings/agent">
        <ArrowLeft size={14} /> Agent personalization
      </Link>
      <input
        aria-label="Skill name"
        className={styles.skillName}
        onChange={(event) => setName(event.target.value)}
        placeholder="Skill name"
        value={name}
      />
      <textarea
        aria-label="Skill instructions"
        className={styles.skillInstructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Add instructions…"
        value={instructions}
      />
      <div className={styles.editorActions}>
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
    <div className={styles.contentColumn}>
      <SectionHeading
        description="Automate product workflows and operations with AI"
        title="AI & Agents"
      />
      <div className={styles.summaryCards}>
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
      <SettingsSection
        description="Create Apps and answer questions about your workspace."
        title="Lenso Agent"
      >
        <Surface className={styles.featureList} level="panel">
          <Link className={styles.featureRow} to="/settings/ai/agent">
            <Bot size={16} />
            <span>
              <strong>Lenso Agent</strong>
              <small>Configure for your workspace</small>
            </span>
            <em>Enabled</em>
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
        </Surface>
      </SettingsSection>
      <SettingsSection
        description="Integrations available to Lenso Agent."
        title="Lenso Agent integrations"
      >
        <SettingsLinkRow
          icon={<Box size={16} />}
          subtitle="Add connectors to your workspace for Agent use"
          title="Available integrations"
        />
      </SettingsSection>
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
    <div className={styles.contentColumn}>
      <Link className={styles.backLink} to="/settings/ai">
        <ArrowLeft size={14} /> AI & Agents
      </Link>
      <SectionHeading
        description="Create Apps and answer questions about your workspace"
        title="Lenso Agent"
      />
      <SettingsSection
        description="Choose which Tools the Console Agent may use. Changes apply to new turns."
        title="Tool access"
      >
        <Surface className={styles.toolPolicy} level="panel">
          <div className={styles.toolPolicySummary}>
            <span>
              <strong>
                {runtimeUnavailable
                  ? "Runtime unavailable"
                  : effectiveTools
                    ? `${effectiveTools.allowed.length} ${effectiveTools.allowed.length === 1 ? "tool" : "tools"} enabled`
                    : "Loading runtime policy…"}
              </strong>
              <small>
                {runtime && effectiveTools
                  ? `${effectiveTools.available.length} available · Profile: ${runtime.profile}`
                  : "Reading the effective Harness policy"}
              </small>
            </span>
          </div>
          {effectiveTools?.available.length ? (
            <ul className={styles.toolList}>
              {effectiveTools.available.map((tool) => (
                <li key={tool.name}>
                  <span>
                    <code>{tool.name}</code>
                    <small>{tool.description}</small>
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
                    <em>
                      {effectiveTools.allowed.includes(tool.name)
                        ? "Enabled"
                        : "Not enabled"}
                    </em>
                  )}
                </li>
              ))}
            </ul>
          ) : effectiveTools ? (
            <p className={styles.noTools}>
              This Console Agent cannot call Tools.
            </p>
          ) : null}
          {toolPolicyError ? (
            <p className={styles.toolPolicyError} role="alert">
              {toolPolicyError}
            </p>
          ) : null}
        </Surface>
      </SettingsSection>
      <SettingsSection
        description="Provide instructions and context for Lenso Agent when responding to conversations"
        title="Workspace guidance"
      >
        <Surface className={styles.singleRow} level="panel">
          <div className={styles.singleRowInner}>
            <span className={styles.rowWithIcon}>
              <CheckCircle2 size={15} />{" "}
              <span>
                <strong>Updates</strong>
                <small>Customize how project updates should be written</small>
              </span>
            </span>
            <ChevronRight size={14} />
          </div>
        </Surface>
        <textarea
          aria-label="Workspace guidance"
          className={styles.guidance}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Optional agent guidance…"
          value={guidance}
        />
      </SettingsSection>
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

function SettingsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className={styles.settingsSection}>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}

function SettingsLinkRow({
  action,
  icon,
  subtitle,
  title,
}: {
  action?: string;
  icon: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <Surface className={styles.singleRow} level="panel">
      <div className={styles.singleRowInner}>
        <span className={styles.rowWithIcon}>
          {icon}
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
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
    <div className={styles.featureRow} data-disabled={disabled || undefined}>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <em>{status}</em>
    </div>
  );
}
