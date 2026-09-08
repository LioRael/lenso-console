import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import * as stylex from "@stylexjs/stylex";
import { Wrench } from "lucide-react";
import { useState } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  importAgentCodingProfiles,
  readAgentToolPolicy,
  selectAgentProfile,
  updateAgentToolPolicy,
  type AgentToolPolicy,
  type AgentTarget,
} from "./agent-runtime";

const styles = stylex.create({
  portal: { position: "relative", zIndex: 100 },
  backdrop: { zIndex: 100 },
  viewport: { zIndex: 101 },
  entry: { flexShrink: 0 },
  entryLabel: {
    display: { default: "inline", "@media (max-width: 760px)": "none" },
  },
  popup: { maxWidth: 540, width: "calc(100vw - 32px)" },
  body: { display: "grid", gap: tokens.space4 },
  section: { display: "grid", gap: tokens.space2 },
  copy: {
    margin: 0,
    color: tokens.colorContentSecondary,
    fontSize: 13,
    lineHeight: 1.5,
  },
  list: {
    display: "grid",
    gap: tokens.space3,
    maxHeight: "35vh",
    overflowY: "auto",
  },
  tool: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.space2,
    fontSize: 13,
  },
  toolCopy: { display: "grid", gap: tokens.space2 },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.space2 },
  error: {
    color: "var(--color-status-error-content)",
    margin: 0,
    fontSize: 13,
  },
});

export function AgentCodingSetup({
  agentId,
  agentLabel,
  busy,
  configure,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  agentId: AgentTarget;
  agentLabel: string;
  busy: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  configure: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [imported, setImported] = useState(false);
  const [policy, setPolicy] = useState<AgentToolPolicy>();
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const run = async (operation: () => Promise<void>) => {
    setSetupError(undefined);
    setStatus(undefined);
    try {
      await configure(operation);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  };
  const unavailable =
    policy?.allowed.filter(
      (name) => !policy.available.some((tool) => tool.name === name)
    ) ?? [];
  const tools = [
    ...(policy?.available ?? []),
    ...unavailable.map((name) => ({
      name,
      description:
        "Unavailable in Code. Clear this grant before saving Tool access.",
    })),
  ];
  const hasUnavailableGrant = unavailable.some((name) =>
    allowed.includes(name)
  );
  return (
    <Dialog.Root
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
        }
      }}
      open={open}
    >
      {hideTrigger ? null : (
        <Button
          aria-label="Set up coding"
          disabled={busy}
          onClick={() => {
            setPolicy(undefined);
            setSaved(false);
            setStatus(undefined);
            setSetupError(undefined);
            setOpen(true);
          }}
          size="compact"
          variant="ghost"
          xstyle={styles.entry}
        >
          <Wrench aria-hidden="true" size={13} />
          <span {...stylex.props(styles.entryLabel)}>Set up coding</span>
        </Button>
      )}
      <Dialog.Portal {...stylex.props(styles.portal)}>
        <Dialog.Backdrop xstyle={styles.backdrop} />
        <Dialog.Viewport xstyle={styles.viewport}>
          <Dialog.Popup xstyle={styles.popup}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Set up coding</Dialog.Title>
                <Dialog.Description>
                  Configure {agentLabel}. Tool access applies to new turns on
                  this Agent.
                </Dialog.Description>
              </div>
              <Dialog.Close disabled={busy} />
            </Dialog.Header>
            <Dialog.Body xstyle={styles.body}>
              <section {...stylex.props(styles.section)}>
                <strong>1. Import coding Profiles</strong>
                <p {...stylex.props(styles.copy)}>
                  Add the official Plan, Code, and sandboxed Code Profiles.
                  Existing customizations are protected.
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await importAgentCodingProfiles(agentId);
                      setImported(true);
                      setStatus(
                        "Coding Profiles imported. Check the environment next."
                      );
                    })
                  }
                  size="compact"
                  variant="secondary"
                >
                  {imported ? "Import again" : "Import coding Profiles"}
                </Button>
              </section>
              <section {...stylex.props(styles.section)}>
                <strong>2. Check the coding environment</strong>
                <p {...stylex.props(styles.copy)}>
                  Activate Code to validate its programs and workspace. If
                  validation fails, the previous mode stays active. Tool access
                  does not change.
                </p>
                <Button
                  disabled={busy || !imported}
                  onClick={() =>
                    void run(async () => {
                      await selectAgentProfile("code", agentId);
                      const current = await readAgentToolPolicy(
                        undefined,
                        agentId
                      );
                      setPolicy(current);
                      setAllowed(current.allowed);
                      setSaved(false);
                      setStatus(
                        "Code is active and its environment is ready. Review Tool access below."
                      );
                    })
                  }
                  size="compact"
                  variant="secondary"
                >
                  Activate Code and check environment
                </Button>
              </section>
              {policy ? (
                <section {...stylex.props(styles.section)}>
                  <strong>3. Authorize Tools</strong>
                  <p {...stylex.props(styles.copy)}>
                    Select the Tools this Agent may use. Editing and command
                    execution can change files. Existing grants remain selected.
                    Clear unavailable grants before saving.
                  </p>
                  <div {...stylex.props(styles.list)}>
                    {tools.map((tool) => (
                      <label key={tool.name} {...stylex.props(styles.tool)}>
                        <input
                          checked={allowed.includes(tool.name)}
                          disabled={busy}
                          onChange={(event) => {
                            setAllowed((current) =>
                              event.target.checked
                                ? [...current, tool.name]
                                : current.filter((name) => name !== tool.name)
                            );
                            setSaved(false);
                          }}
                          type="checkbox"
                        />
                        <span {...stylex.props(styles.toolCopy)}>
                          <strong>{tool.name}</strong>
                          <span {...stylex.props(styles.copy)}>
                            {tool.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button
                    disabled={busy || hasUnavailableGrant}
                    onClick={() =>
                      void run(async () => {
                        const updated = await updateAgentToolPolicy({
                          allowed,
                          expectedRevision: policy.revision,
                          targetId: agentId,
                        });
                        setPolicy(updated);
                        setSaved(true);
                        setStatus(
                          "Tool access saved. Choose Plan or Code to continue."
                        );
                      })
                    }
                    size="compact"
                    variant="primary"
                  >
                    Save Tool access
                  </Button>
                  {saved ? (
                    <div {...stylex.props(styles.actions)}>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await selectAgentProfile("plan", agentId);
                            setStatus(
                              "Plan is active. Close setup and describe your task."
                            );
                          })
                        }
                        size="compact"
                        variant="secondary"
                      >
                        Use Plan
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await selectAgentProfile("code", agentId);
                            setStatus(
                              "Code is active. Close setup and describe your task."
                            );
                          })
                        }
                        size="compact"
                        variant="secondary"
                      >
                        Use Code
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {busy ? (
                <output {...stylex.props(styles.copy)}>
                  Applying configuration…
                </output>
              ) : null}
              {status ? (
                <output {...stylex.props(styles.copy)}>{status}</output>
              ) : null}
              {setupError ? (
                <p role="alert" {...stylex.props(styles.error)}>
                  {setupError}
                </p>
              ) : null}
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close
                disabled={busy}
                render={<Button size="compact" variant="ghost" />}
              >
                Close
              </Dialog.Close>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
