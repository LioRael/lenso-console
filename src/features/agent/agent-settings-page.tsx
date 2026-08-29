import { Surface } from "@lenso/ui/surface";
import { Switch } from "@lenso/ui/switch";
import { useEffect, useState } from "react";

import {
  readAgentBootstrap,
  readAgentToolPolicy,
  updateAgentToolPolicy,
  type AgentBootstrap,
  type AgentToolPolicy,
} from "./agent-runtime";

import styles from "./agent-settings-page.module.css";

export function AgentSettingsPage() {
  const [runtime, setRuntime] = useState<AgentBootstrap>();
  const [toolPolicy, setToolPolicy] = useState<AgentToolPolicy>();
  const [toolPolicyError, setToolPolicyError] = useState<string>();
  const [savingTool, setSavingTool] = useState<string>();
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadRuntimePolicy = async () => {
      const policyRequest = settleAgentToolPolicy(controller.signal);
      try {
        const bootstrap = await readAgentBootstrap(controller.signal);
        setRuntime(bootstrap);
        setRuntimeUnavailable(false);
      } catch {
        if (!controller.signal.aborted) {
          setRuntimeUnavailable(true);
        }
      }

      const result = await policyRequest;
      if (controller.signal.aborted) {
        return;
      }
      if ("policy" in result) {
        setToolPolicy(result.policy);
        setToolPolicyError(undefined);
        return;
      }
      setToolPolicyError(
        result.error instanceof Error
          ? result.error.message
          : "Tool policy is unavailable"
      );
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
    <main className={styles.page}>
      <div className={styles.contentColumn}>
        <header className={styles.sectionHeading}>
          <h1>Agent tool access</h1>
          <p>
            Choose which tools the local Agent Harness may use. Changes apply to
            new turns.
          </p>
        </header>
        <Surface className={styles.toolPolicy} level="panel">
          <div className={styles.toolPolicySummary}>
            <strong>
              {runtimeUnavailable
                ? "Agent Harness unavailable"
                : effectiveTools
                  ? `${effectiveTools.allowed.length} ${effectiveTools.allowed.length === 1 ? "tool" : "tools"} enabled`
                  : "Loading tool policy…"}
            </strong>
            <small>
              {runtime && effectiveTools
                ? `${effectiveTools.available.length} available · Profile: ${runtime.profile}`
                : "Reading the effective Harness policy"}
            </small>
          </div>
          {effectiveTools?.available.length ? (
            <ul className={styles.toolList}>
              {effectiveTools.available.map((tool) => (
                <li key={tool.name}>
                  <span>
                    <code>{tool.name}</code>
                    <small>{tool.description}</small>
                  </span>
                  {toolPolicy ? (
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
            <p className={styles.noTools}>This Agent cannot call tools.</p>
          ) : null}
          {toolPolicyError ? (
            <p className={styles.toolPolicyError} role="alert">
              {toolPolicyError}
            </p>
          ) : null}
        </Surface>
      </div>
    </main>
  );
}

async function settleAgentToolPolicy(signal: AbortSignal) {
  try {
    return { policy: await readAgentToolPolicy(signal) };
  } catch (error) {
    return { error };
  }
}
