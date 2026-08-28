import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { Button } from "@lenso/ui/button";
import { Disclosure } from "@lenso/ui/disclosure";
import { PageHeader } from "@lenso/ui/page-header";
import { StatusMarker, type StatusMarkerStatus } from "@lenso/ui/status-marker";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  shortPluginDigest,
  type PluginGenerationState,
} from "./plugin-workbench-model";
import type { PluginWorkbenchStreamState } from "./plugin-workbench-stream";
import { usePluginWorkbench } from "./use-plugin-workbench";

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
});

export function PluginWorkbenchPage() {
  const workbench = usePluginWorkbench();
  const projection = workbench.data;
  const plugins = projection?.plugins ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    plugins.find((plugin) => plugin.instanceKey === selectedKey) ?? plugins[0];
  const connection = connectionState(workbench.mode, workbench.streamState);

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
            <span {...stylex.props(styles.headerStatus)}>
              <StatusMarker presentation="dot" status={connection.status} />
              {connection.label}
            </span>
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
                aria-pressed={selected?.instanceKey === plugin.instanceKey}
                key={plugin.instanceKey}
                onClick={() => setSelectedKey(plugin.instanceKey)}
                type="button"
                {...stylex.props(
                  styles.row,
                  selected?.instanceKey === plugin.instanceKey &&
                    styles.rowSelected
                )}
              >
                <span {...stylex.props(styles.identity)}>
                  <span {...stylex.props(styles.primary)}>
                    {plugin.instanceKey}
                  </span>
                  <span {...stylex.props(styles.secondary)}>
                    {plugin.capabilityIds.length}{" "}
                    {plugin.capabilityIds.length === 1
                      ? "capability"
                      : "capabilities"}
                  </span>
                </span>
                <span {...stylex.props(styles.identity, styles.packageColumn)}>
                  <span {...stylex.props(styles.secondary, styles.mono)}>
                    {plugin.packageId}
                  </span>
                  <span {...stylex.props(styles.secondary)}>
                    {plugin.packageVersion}
                  </span>
                </span>
                <StatusMarker
                  presentation="label"
                  status={stateStatus(plugin.state)}
                >
                  {stateLabel(plugin.state)}
                </StatusMarker>
              </button>
            ))}
          </section>

          <aside
            aria-label="Plugin details"
            {...stylex.props(styles.inspector)}
          >
            {selected && projection ? (
              <>
                <header {...stylex.props(styles.inspectorHeader)}>
                  <div {...stylex.props(styles.inspectorIdentity)}>
                    <h2 {...stylex.props(styles.inspectorTitle)}>
                      {selected.instanceKey}
                    </h2>
                    <span {...stylex.props(styles.secondary, styles.mono)}>
                      {selected.packageId}
                    </span>
                  </div>
                  <StatusMarker
                    presentation="label"
                    status={stateStatus(selected.state)}
                  >
                    {stateLabel(selected.state)}
                  </StatusMarker>
                </header>
                <DetailListSection title="Package">
                  <Detail label="Package" value={selected.packageId} mono />
                  <Detail label="Version" value={selected.packageVersion} />
                </DetailListSection>
                <DetailSection title="Capabilities">
                  <div {...stylex.props(styles.capabilities)}>
                    {selected.capabilityIds.length > 0 ? (
                      selected.capabilityIds.map((capability) => (
                        <code
                          key={capability}
                          {...stylex.props(styles.capability)}
                        >
                          {capability}
                        </code>
                      ))
                    ) : (
                      <span {...stylex.props(styles.value)}>
                        No capabilities declared
                      </span>
                    )}
                  </div>
                </DetailSection>
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
                          value={selected.instanceKey}
                          mono
                        />
                        <Detail
                          label="Receipt"
                          value={shortPluginDigest(selected.receiptDigest)}
                          mono
                        />
                        <Detail
                          label="Generation"
                          value={projection.generation.generationId}
                          mono
                        />
                        <Detail
                          label="Plan"
                          value={shortPluginDigest(
                            projection.generation.planDigest
                          )}
                          mono
                        />
                        <Detail
                          label="Activated"
                          value={formatTimestamp(
                            projection.generation.activatedAt
                          )}
                        />
                        <Detail
                          label="Updated"
                          value={formatTimestamp(projection.observedAt)}
                        />
                      </dl>
                    </Disclosure.Panel>
                  </Disclosure.Item>
                </Disclosure.Root>
              </>
            ) : null}
          </aside>
        </div>
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

function connectionState(
  mode: "demo" | "live",
  streamState: PluginWorkbenchStreamState
): { label: string; status: StatusMarkerStatus } {
  if (mode === "demo") {
    return { label: "Preview data", status: "neutral" };
  }
  if (streamState === "live") {
    return { label: "Live", status: "success" };
  }
  if (streamState === "connecting" || streamState === "reconnecting") {
    return { label: "Updating", status: "warning" };
  }
  return { label: "Offline", status: "neutral" };
}

function stateStatus(state: PluginGenerationState): StatusMarkerStatus {
  if (state === "active" || state === "standby") {
    return "success";
  }
  if (state === "failed") {
    return "error";
  }
  return "warning";
}

function stateLabel(state: PluginGenerationState) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function formatTimestamp(value: string) {
  return `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
