import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { Disclosure } from "@lenso/ui/disclosure";
import { PageHeader } from "@lenso/ui/page-header";
import { StatusMarker } from "@lenso/ui/status-marker";
import { Switch } from "@lenso/ui/switch";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Boxes, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import type { PluginWorkbenchItem } from "./plugin-workbench-model";
import {
  usePluginConfigurationProposal,
  usePluginMutation,
  usePluginWorkbench,
} from "./use-plugin-workbench";

const styles = stylex.create({
  page: {
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "44px minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
    width: "100%",
  },
  header: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    height: 44,
  },
  headerStatus: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "inline-flex",
    fontSize: 11,
    gap: tokens.space2,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space3,
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
    "@media (max-width: 1000px)": {
      display: "block",
      overflow: "auto",
    },
  },
  tableRegion: {
    minWidth: 0,
    overflow: "auto",
  },
  columns: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    fontSize: 11,
    fontWeight: 500,
    gap: tokens.space4,
    gridTemplateColumns: "minmax(180px, 1.4fr) minmax(180px, 1fr) 88px",
    height: 32,
    paddingInline: 14,
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) 88px",
    },
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
  identity: { display: "grid", gap: 2, minWidth: 0 },
  primary: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  secondary: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  packageColumn: {
    "@media (max-width: 720px)": {
      display: "none",
    },
  },
  inspector: {
    borderInlineStartColor: tokens.colorBorderTertiary,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    minWidth: 0,
    overflow: "auto",
    "@media (max-width: 1000px)": {
      borderBlockStartColor: tokens.colorBorderTertiary,
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: 1,
      borderInlineStartStyle: "none",
      minHeight: 280,
    },
  },
  inspectorHeader: {
    alignItems: "center",
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: tokens.space3,
    justifyContent: "space-between",
    minHeight: 58,
    paddingBlock: 8,
    paddingInline: 14,
  },
  inspectorIdentity: { display: "grid", gap: 2, minWidth: 0 },
  inspectorTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: "18px",
    margin: 0,
  },
  section: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: tokens.space2,
    paddingBlock: tokens.space3,
    paddingInline: 14,
  },
  sectionTitle: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    fontWeight: 500,
    margin: 0,
  },
  controlRow: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space4,
    justifyContent: "space-between",
    minHeight: 32,
  },
  controlCopy: { display: "grid", gap: 2, minWidth: 0 },
  controlTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 12,
    fontWeight: 500,
  },
  controlDescription: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
  },
  editor: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: tokens.colorContentPrimary,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: "17px",
    minHeight: 168,
    outline: {
      default: "none",
      ":focus": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -1,
    padding: 10,
    resize: "vertical",
    width: "100%",
  },
  editorActions: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    justifyContent: "flex-end",
  },
  hiddenAction: { visibility: "hidden" },
  feedback: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
  },
  feedbackError: { color: "var(--color-status-error-content)" },
  destructive: {
    color: "var(--color-action-danger)",
  },
  dialogPopup: { maxWidth: 440, width: "calc(100vw - 32px)" },
  dialogField: { display: "grid", gap: tokens.space2 },
  dialogLabel: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    fontWeight: 500,
  },
  input: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: tokens.colorContentPrimary,
    fontFamily: tokens.fontSans,
    fontSize: 12,
    height: 32,
    outline: {
      default: "none",
      ":focus": `2px solid ${tokens.colorFocusRing}`,
    },
    paddingInline: 9,
    width: "100%",
  },
  fields: { display: "grid", gap: tokens.space2, margin: 0 },
  field: {
    display: "grid",
    gap: tokens.space3,
    gridTemplateColumns: "88px minmax(0, 1fr)",
  },
  term: { color: tokens.colorContentTertiary, fontSize: 12 },
  value: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    margin: 0,
    overflowWrap: "anywhere",
  },
  capabilities: {
    display: "grid",
    gap: tokens.space2,
  },
  capability: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.colorContentSecondary,
    display: "block",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space3,
  },
  disclosure: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  technicalPanel: {
    paddingBlockEnd: tokens.space3,
    paddingInline: 14,
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
  stateTitle: {
    color: tokens.colorContentPrimary,
    fontSize: 13,
    fontWeight: 500,
    margin: 0,
  },
  stateDescription: {
    fontSize: 12,
    lineHeight: "18px",
    margin: 0,
    maxWidth: 420,
  },
  mutationFeedback: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
    overflowWrap: "anywhere",
  },
});

export function PluginWorkbenchPage() {
  const workbench = usePluginWorkbench();
  const mutation = usePluginMutation();
  const plugins = workbench.data?.items ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    plugins.find((plugin) => pluginKey(plugin) === selectedKey) ?? plugins[0];

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
              <Breadcrumb.Item>
                <Breadcrumb.Link nativeButton={false} render={<Link to="/" />}>
                  <Breadcrumb.Icon>
                    <Boxes size={14} strokeWidth={1.75} />
                  </Breadcrumb.Icon>
                  Lenso
                </Breadcrumb.Link>
              </Breadcrumb.Item>
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <Breadcrumb.Page>Plugins</Breadcrumb.Page>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>
          <PageHeader.Spacer />
          <PageHeader.Actions>
            <div {...stylex.props(styles.headerActions)}>
              <span {...stylex.props(styles.headerStatus)}>
                <StatusMarker presentation="dot" status="success" />
                Plugin Root ready
              </span>
              <InstallPluginDialog
                error={mutation.error}
                isPending={mutation.isPending}
                onInstall={async (bundlePath) => {
                  await mutation.mutateAsync({ bundlePath, type: "install" });
                }}
              />
            </div>
          </PageHeader.Actions>
        </PageHeader.Row>
      </PageHeader.Root>
      <h1 id="plugins-heading" {...stylex.props(styles.visuallyHidden)}>
        Plugins
      </h1>
      {workbench.isPending ? (
        <WorkbenchState
          description="Reading the active App configuration."
          title="Loading Plugins"
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
          description="The active App configuration could not be loaded."
          title="Plugins unavailable"
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
            <div aria-hidden="true" {...stylex.props(styles.columns)}>
              <span>Plugin</span>
              <span {...stylex.props(styles.packageColumn)}>Package</span>
              <span>Status</span>
            </div>
            {plugins.map((plugin) => (
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
                    {plugin.origin === "host-default"
                      ? "Included by Host"
                      : "Added to Plugin Root"}
                  </span>
                </span>
                <span {...stylex.props(styles.identity, styles.packageColumn)}>
                  <span {...stylex.props(styles.secondary, styles.mono)}>
                    {plugin.packageId}
                  </span>
                  <span {...stylex.props(styles.secondary)}>
                    {plugin.packageRevision || "linked"}
                  </span>
                </span>
                <StatusMarker
                  presentation="label"
                  status={
                    plugin.selection === "enabled" ? "success" : "neutral"
                  }
                >
                  {plugin.selection === "enabled" ? "Enabled" : "Disabled"}
                </StatusMarker>
              </button>
            ))}
          </section>

          <aside
            aria-label="Plugin details"
            {...stylex.props(styles.inspector)}
          >
            {selected ? (
              <PluginInspector
                appliedRevision={
                  workbench.data?.inventory.appliedRevision ?? null
                }
                configurationStatus={
                  workbench.data?.inventory.configurationStatus ?? "unavailable"
                }
                key={pluginKey(selected)}
                mutation={mutation}
                plugin={selected}
                revision={workbench.data?.management.revision ?? ""}
              />
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function PluginInspector({
  appliedRevision,
  configurationStatus,
  mutation,
  plugin,
  revision,
}: {
  appliedRevision: string | null;
  configurationStatus: "applied" | "pending" | "rejected" | "unavailable";
  mutation: ReturnType<typeof usePluginMutation>;
  plugin: PluginWorkbenchItem;
  revision: string;
}) {
  const proposal = usePluginConfigurationProposal();
  const initialToml = plugin.rootConfigurationToml ?? "";
  const [toml, setToml] = useState(initialToml);
  const restoreWasVisible = useRef(plugin.hasRootDifference).current;
  const enabled = plugin.selection === "enabled";
  const restoreVisible = plugin.hasRootDifference || restoreWasVisible;
  const error =
    proposal.error instanceof Error
      ? proposal.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : null;

  return (
    <>
      <header {...stylex.props(styles.inspectorHeader)}>
        <div {...stylex.props(styles.inspectorIdentity)}>
          <h2 {...stylex.props(styles.inspectorTitle)}>
            {plugin.packageId}/{plugin.instanceKey}
          </h2>
          <span {...stylex.props(styles.secondary)}>
            {plugin.origin === "host-default"
              ? "Included by Host"
              : "Added to Plugin Root"}
          </span>
        </div>
        <StatusMarker
          presentation="label"
          status={enabled ? "success" : "neutral"}
        >
          {enabled ? "Enabled" : "Disabled"}
        </StatusMarker>
      </header>

      <DetailSection title="Selection">
        <div {...stylex.props(styles.controlRow)}>
          <div {...stylex.props(styles.controlCopy)}>
            <span {...stylex.props(styles.controlTitle)}>Enabled</span>
            <span {...stylex.props(styles.controlDescription)}>
              {plugin.disableable
                ? "Changes prepare and switch to a new App Generation."
                : "This Host requires the Instance and does not allow disabling it."}
            </span>
          </div>
          <Switch.Root
            aria-label={`Enable ${plugin.packageId}/${plugin.instanceKey}`}
            checked={enabled}
            disabled={!plugin.disableable || mutation.isPending}
            onCheckedChange={(checked) => {
              proposal.reset();
              mutation.reset();
              mutation.mutate({
                enabled: checked,
                instanceKey: plugin.instanceKey,
                packageId: plugin.packageId,
                type: "select",
              });
            }}
            size="default"
          >
            <Switch.Thumb />
          </Switch.Root>
        </div>
      </DetailSection>

      <DetailSection title="Configuration">
        <textarea
          aria-label={`TOML configuration for ${plugin.packageId}/${plugin.instanceKey}`}
          onChange={(event) => {
            proposal.reset();
            mutation.reset();
            setToml(event.target.value);
          }}
          placeholder="# App-owned TOML override"
          spellCheck={false}
          value={toml}
          {...stylex.props(styles.editor)}
        />
        <div {...stylex.props(styles.editorActions)}>
          <Button
            aria-hidden={!restoreVisible}
            disabled={mutation.isPending || !plugin.hasRootDifference}
            onClick={() => {
              proposal.reset();
              mutation.reset();
              mutation.mutate({
                instanceKey: plugin.instanceKey,
                packageId: plugin.packageId,
                type: "reset",
              });
            }}
            size="compact"
            tabIndex={plugin.hasRootDifference ? 0 : -1}
            variant="ghost"
            {...stylex.props(!restoreVisible && styles.hiddenAction)}
          >
            <RotateCcw size={13} strokeWidth={1.75} />
            Restore Host value
          </Button>
          <Button
            disabled={
              proposal.isPending || mutation.isPending || toml === initialToml
            }
            onClick={() => {
              if (proposal.data?.status === "ready") {
                mutation.reset();
                mutation.mutate({
                  expectedRevision: proposal.data.baseRevision,
                  instanceKey: plugin.instanceKey,
                  packageId: plugin.packageId,
                  proposalDigest: proposal.data.proposalDigest,
                  toml,
                  type: "configure",
                });
                return;
              }
              proposal.reset();
              proposal.mutate({
                expectedRevision: revision,
                instanceKey: plugin.instanceKey,
                packageId: plugin.packageId,
                toml,
              });
            }}
            size="compact"
            variant="primary"
          >
            {proposal.data?.status === "ready"
              ? "Publish configuration"
              : "Preview change"}
          </Button>
        </div>
        {error ? (
          <p
            role="alert"
            {...stylex.props(styles.feedback, styles.feedbackError)}
          >
            {error}
          </p>
        ) : mutation.isSuccess && mutation.variables?.type === "configure" ? (
          <p aria-live="polite" {...stylex.props(styles.feedback)}>
            {configurationStatus === "applied"
              ? "Published and applied to the active Generation."
              : configurationStatus === "rejected"
                ? "Published, but the Host rejected the candidate Generation."
                : "Published. The Host is preparing the next Generation."}
          </p>
        ) : proposal.data?.status === "ready" ? (
          <p aria-live="polite" {...stylex.props(styles.feedback)}>
            Preview ready. Publishing will create revision{" "}
            {shortRevision(proposal.data.candidateRevision)} and prepare a new
            App Generation.
          </p>
        ) : proposal.data ? (
          <p
            role="alert"
            {...stylex.props(styles.feedback, styles.feedbackError)}
          >
            {proposal.data.diagnostics[0]?.detail ??
              "This configuration cannot be published."}
          </p>
        ) : null}
        <p {...stylex.props(styles.feedback)}>
          Desired {shortRevision(revision)} · Applied{" "}
          {shortRevision(appliedRevision)} · {configurationStatus}
        </p>
      </DetailSection>

      <DetailListSection title="Package">
        <Detail label="Package" value={plugin.packageId} mono />
        <Detail
          label="Revision"
          value={plugin.packageRevision || "linked into Host"}
        />
        <Detail
          label="Authority"
          value={plugin.rootSupplied ? "Plugin Root" : "Host Catalog"}
        />
      </DetailListSection>

      {plugin.active ? (
        <DetailSection title="Capabilities">
          <div {...stylex.props(styles.capabilities)}>
            {plugin.active.providedCapabilities.length > 0 ? (
              plugin.active.providedCapabilities.map((capability) => (
                <code key={capability} {...stylex.props(styles.capability)}>
                  {capability}
                </code>
              ))
            ) : (
              <span {...stylex.props(styles.value)}>
                No capabilities provided
              </span>
            )}
          </div>
        </DetailSection>
      ) : null}

      <Disclosure.Root {...stylex.props(styles.disclosure)}>
        <Disclosure.Item value="technical-details">
          <Disclosure.Header>
            <Disclosure.Trigger>
              <Disclosure.Icon />
              Technical details
            </Disclosure.Trigger>
          </Disclosure.Header>
          <Disclosure.Panel
            layout="auto"
            {...stylex.props(styles.technicalPanel)}
          >
            <dl {...stylex.props(styles.fields)}>
              <Detail
                label="Instance"
                value={`${plugin.packageId}/${plugin.instanceKey}`}
                mono
              />
              <Detail
                label="Entrypoint"
                value={plugin.active?.entrypoint ?? "Not active"}
                mono
              />
              <Detail
                label="Execution"
                value={plugin.active?.executionClass ?? "Not active"}
                mono
              />
              <Detail
                label="Requires"
                value={plugin.active?.requiredCapabilities.join(", ") || "None"}
                mono
              />
            </dl>
          </Disclosure.Panel>
        </Disclosure.Item>
      </Disclosure.Root>

      {plugin.rootSupplied ? (
        <DetailSection title="Plugin Root">
          <RemovePluginDialog
            isPending={mutation.isPending}
            onRemove={async () => {
              await mutation.mutateAsync({
                packageId: plugin.packageId,
                type: "remove",
              });
            }}
            packageId={plugin.packageId}
          />
        </DetailSection>
      ) : null}
    </>
  );
}

function InstallPluginDialog({
  error,
  isPending,
  onInstall,
}: {
  error: Error | null;
  isPending: boolean;
  onInstall: (bundlePath: string) => Promise<void>;
}) {
  const [bundlePath, setBundlePath] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Button onClick={() => setOpen(true)} size="compact" variant="secondary">
        <Plus size={13} strokeWidth={1.75} />
        Install
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup {...stylex.props(styles.dialogPopup)}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Install Plugin</Dialog.Title>
                <Dialog.Description>
                  Add a verified Plugin Bundle available on this Host.
                </Dialog.Description>
              </div>
              <Dialog.Close />
            </Dialog.Header>
            <Dialog.Body>
              <label {...stylex.props(styles.dialogField)}>
                <span {...stylex.props(styles.dialogLabel)}>
                  Absolute bundle path
                </span>
                <input
                  autoFocus
                  onChange={(event) => setBundlePath(event.target.value)}
                  placeholder="/opt/lenso/plugins/example.lenso-plugin"
                  value={bundlePath}
                  {...stylex.props(styles.input)}
                />
              </label>
              {error ? (
                <p
                  role="alert"
                  {...stylex.props(styles.feedback, styles.feedbackError)}
                >
                  {error.message}
                </p>
              ) : null}
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close render={<Button size="compact" variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                disabled={isPending || !bundlePath.trim()}
                onClick={async () => {
                  try {
                    await onInstall(bundlePath.trim());
                    setOpen(false);
                    setBundlePath("");
                  } catch {
                    // The shared mutation error is rendered above.
                  }
                }}
                size="compact"
                variant="primary"
              >
                Install Plugin
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RemovePluginDialog({
  isPending,
  onRemove,
  packageId,
}: {
  isPending: boolean;
  onRemove: () => Promise<void>;
  packageId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Button
        onClick={() => setOpen(true)}
        size="compact"
        variant="ghost"
        {...stylex.props(styles.destructive)}
      >
        <Trash2 size={13} strokeWidth={1.75} />
        Remove Plugin
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup {...stylex.props(styles.dialogPopup)}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Remove {packageId}?</Dialog.Title>
                <Dialog.Description>
                  The Plugin directory will move to recoverable Lenso trash
                  after the remaining App validates.
                </Dialog.Description>
              </div>
              <Dialog.Close />
            </Dialog.Header>
            <Dialog.Footer>
              <Dialog.Close render={<Button size="compact" variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                disabled={isPending}
                onClick={async () => {
                  try {
                    await onRemove();
                    setOpen(false);
                  } catch {
                    // The shared mutation error is rendered in the inspector.
                  }
                }}
                size="compact"
                variant="primary"
              >
                Remove Plugin
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function shortRevision(revision: string | null): string {
  return revision
    ? revision.slice("sha256:".length, "sha256:".length + 8)
    : "—";
}

function pluginKey(plugin: PluginWorkbenchItem) {
  return `${plugin.packageId}/${plugin.instanceKey}`;
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

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section {...stylex.props(styles.section)}>
      <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3>
      {children}
    </section>
  );
}

function DetailListSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <DetailSection title={title}>
      <dl {...stylex.props(styles.fields)}>{children}</dl>
    </DetailSection>
  );
}

function Detail({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div {...stylex.props(styles.field)}>
      <dt {...stylex.props(styles.term)}>{label}</dt>
      <dd {...stylex.props(styles.value, mono && styles.mono)}>{value}</dd>
    </div>
  );
}
