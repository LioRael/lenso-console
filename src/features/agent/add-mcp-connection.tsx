import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { readPluginConfigurationProposal } from "../plugins/plugin-control-client";
import {
  usePluginMutation,
  type PluginWorkbenchData,
} from "../plugins/use-plugin-workbench";
import { settingsPageStyles as page } from "../settings/settings-page.stylex";
import { agentSettingsStyles as styles } from "./agent-settings-page.stylex";
import {
  absentConfigurationDigest,
  mcpConfiguration,
  MCP_PACKAGE,
  type McpConnectionDraft,
} from "./mcp-connection-model";

export function AddMcpConnection({
  agentId,
  data,
  onAdded,
}: {
  agentId: string;
  data: PluginWorkbenchData;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState<McpConnectionDraft>({
    name: "",
    transport: "streamable_http",
    endpoint: "",
    authorization: "",
    program: "",
    arguments: "",
    directory: "",
    environment: "",
  });
  const mutation = usePluginMutation(agentId, data.inventory.streamId);
  const available = data.management.plugins.find(
    (item) => item.packageId === MCP_PACKAGE
  );
  const field = (
    key: keyof McpConnectionDraft,
    label: string,
    placeholder = ""
  ) => (
    <label {...stylex.props(styles.rowCopy, local.field)}>
      {label}
      <TextField.Root>
        <TextField.Control
          aria-label={label}
          disabled={pending}
          value={draft[key]}
          placeholder={placeholder}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [key]: event.target.value }))
          }
        />
      </TextField.Root>
    </label>
  );
  const add = async () => {
    setErrorMessage("");
    setPending(true);
    try {
      if (
        available?.instances.some(
          (item) =>
            item.instanceKey === draft.name ||
            item.instanceKey === `${MCP_PACKAGE}/${draft.name}`
        )
      ) {
        throw new Error("A connection with this name already exists.");
      }
      const toml = mcpConfiguration(draft);
      const request = {
        expectedRevision: data.management.revision,
        expectedStreamId: data.inventory.streamId,
        expectedSourceDigest: await absentConfigurationDigest(draft.name),
        instanceKey: draft.name,
        packageId: MCP_PACKAGE,
        toml,
      };
      const proposal = await readPluginConfigurationProposal(
        request,
        undefined,
        agentId
      );
      if (proposal.status !== "ready" || proposal.application === "blocked") {
        throw new Error(
          proposal.diagnostics.map((item) => item.detail).join("\n") ||
            "The Agent could not validate this connection."
        );
      }
      await mutation.mutateAsync({
        ...request,
        type: "configure",
        proposalDigest: proposal.proposalDigest,
      });
      setSaved(`Added ${draft.name}. Enable its capabilities in a Profile.`);
      setOpen(false);
      onAdded();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The connection could not be added."
      );
    } finally {
      setPending(false);
    }
  };
  if (!available) {
    return null;
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
        }
      }}
    >
      <Button
        size="compact"
        onClick={() => {
          setOpen(true);
          setSaved("");
        }}
        disabled={open}
      >
        Add MCP
      </Button>
      {saved ? <output {...stylex.props(styles.notice)}>{saved}</output> : null}
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup xstyle={local.popup}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
              {...stylex.props(page.group, local.form)}
            >
              <Dialog.Title>Add MCP connection</Dialog.Title>
              <div {...stylex.props(page.headerActions)}>
                <Button
                  type="button"
                  size="compact"
                  variant={
                    draft.transport === "streamable_http"
                      ? "primary"
                      : "secondary"
                  }
                  disabled={pending}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      transport: "streamable_http",
                    }))
                  }
                >
                  Remote URL
                </Button>
                <Button
                  type="button"
                  size="compact"
                  variant={
                    draft.transport === "stdio" ? "primary" : "secondary"
                  }
                  disabled={pending}
                  onClick={() =>
                    setDraft((current) => ({ ...current, transport: "stdio" }))
                  }
                >
                  Local command
                </Button>
              </div>
              {field("name", "Connection name", "my_server")}
              {draft.transport === "streamable_http" ? (
                <>
                  {field("endpoint", "Server URL", "https://example.com/mcp")}
                  {field(
                    "authorization",
                    "Authorization variable (optional)",
                    "MCP_AUTHORIZATION"
                  )}
                </>
              ) : (
                <>
                  {field(
                    "program",
                    "Executable path",
                    "/absolute/path/to/server"
                  )}
                  {field(
                    "directory",
                    "Working directory",
                    "/absolute/path/to/project"
                  )}
                  <label {...stylex.props(styles.rowCopy, local.field)}>
                    Arguments (one per line)
                    <textarea
                      disabled={pending}
                      aria-label="Arguments (one per line)"
                      value={draft.arguments}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          arguments: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {field(
                    "environment",
                    "Environment variables (optional)",
                    "API_KEY"
                  )}
                </>
              )}
              <p {...stylex.props(styles.description)}>
                Use environment variable names for credentials. Their values
                must be available to the Agent process.
              </p>
              <p {...stylex.props(styles.description)}>
                Configuration is validated before saving. The Agent checks
                connectivity when this MCP is enabled.
              </p>
              {errorMessage ? (
                <p role="alert" {...stylex.props(styles.error)}>
                  {errorMessage}
                </p>
              ) : null}
              <div {...stylex.props(page.headerActions)}>
                <Button type="submit" size="compact" disabled={pending}>
                  {pending ? "Adding…" : "Add connection"}
                </Button>
                <Button
                  type="button"
                  size="compact"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const local = stylex.create({
  popup: {
    width: "min(520px, calc(100vw - 32px))",
    maxHeight: "calc(100dvh - 48px)",
    overflowY: "auto",
    padding: 0,
  },
  field: { fontSize: 13, lineHeight: "20px", gap: 6 },
  form: { display: "grid", gap: 16, padding: 20, marginBlockStart: 0 },
});
