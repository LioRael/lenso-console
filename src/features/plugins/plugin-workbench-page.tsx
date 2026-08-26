import { Breadcrumb } from "@lenso/ui/breadcrumb";
import { PageHeader } from "@lenso/ui/page-header";
import { StatusMarker, type StatusMarkerStatus } from "@lenso/ui/status-marker";
import { Surface } from "@lenso/ui/surface";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  shortPluginDigest,
  type PluginGenerationState,
} from "./plugin-workbench-model";
import { usePluginWorkbench } from "./use-plugin-workbench";

const styles = stylex.create({
  page: {
    boxSizing: "border-box",
    display: "grid",
    marginInline: "auto",
    maxWidth: 1440,
    width: "100%",
  },
  header: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  content: {
    display: "grid",
    gap: tokens.space4,
    paddingBlock: tokens.space6,
    paddingInline: tokens.space6,
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
  description: {
    color: tokens.colorContentTertiary,
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  },
  workspace: {
    display: "grid",
    gap: tokens.space4,
    gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
    minHeight: 560,
    "@media (max-width: 1200px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  panel: {
    alignItems: "stretch",
    gap: 0,
    minWidth: 0,
    overflow: "hidden",
    padding: 0,
    width: "100%",
  },
  panelHeader: {
    alignItems: "center",
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    height: 44,
    justifyContent: "space-between",
    paddingInline: tokens.space4,
  },
  panelTitle: { fontSize: 13, fontWeight: 500, margin: 0 },
  panelMeta: { color: tokens.colorContentTertiary, fontSize: 12 },
  columns: {
    alignItems: "center",
    color: tokens.colorContentTertiary,
    display: "grid",
    fontSize: 11,
    gap: tokens.space3,
    gridTemplateColumns: "minmax(180px, 1.2fr) minmax(160px, 1fr) 72px 92px",
    minHeight: 36,
    paddingInline: tokens.space4,
  },
  row: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": tokens.colorSurfaceInteractiveHover,
    },
    borderBlockStartColor: tokens.colorBorderTertiary,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    borderInlineStyle: "none",
    borderInlineWidth: 0,
    borderBlockEndStyle: "none",
    color: tokens.colorContentSecondary,
    cursor: "pointer",
    display: "grid",
    fontFamily: tokens.fontSans,
    fontSize: 12,
    gap: tokens.space3,
    gridTemplateColumns: "minmax(180px, 1.2fr) minmax(160px, 1fr) 72px 92px",
    minHeight: 58,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -2,
    paddingInline: tokens.space4,
    textAlign: "left",
    width: "100%",
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
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inspectorHeader: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: tokens.space2,
    padding: tokens.space4,
  },
  inspectorTitle: { fontSize: 16, fontWeight: 600, margin: 0 },
  inspectorBody: { display: "grid" },
  section: {
    borderBottomColor: tokens.colorBorderTertiary,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: tokens.space2,
    padding: tokens.space4,
  },
  sectionTitle: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    fontWeight: 500,
    margin: 0,
    textTransform: "uppercase",
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
  empty: { color: tokens.colorContentTertiary, padding: tokens.space4 },
});

export function PluginWorkbenchPage() {
  const workbench = usePluginWorkbench();
  const projection = workbench.data;
  const plugins = projection?.plugins ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    plugins.find((plugin) => plugin.instanceKey === selectedKey) ?? plugins[0];

  return (
    <div {...stylex.props(styles.page)}>
      <PageHeader.Root
        aria-label="Plugin navigation"
        {...stylex.props(styles.header)}
        variant="simple"
      >
        <PageHeader.Row>
          <Breadcrumb.Root aria-label="Plugin breadcrumb">
            <Breadcrumb.List>
              <Breadcrumb.Item>
                <Breadcrumb.Link nativeButton={false} render={<Link to="/" />}>
                  <Breadcrumb.Icon>
                    <Boxes size={14} strokeWidth={1.75} />
                  </Breadcrumb.Icon>
                  System
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
            <StatusMarker
              presentation="label"
              status={workbench.streamState === "live" ? "success" : "neutral"}
            >
              {workbench.mode === "live" ? "Live" : "Demo"} ·{" "}
              {streamLabel(workbench.streamState)}
            </StatusMarker>
          </PageHeader.Actions>
        </PageHeader.Row>
      </PageHeader.Root>
      <div {...stylex.props(styles.content)}>
        <h1 {...stylex.props(styles.visuallyHidden)}>Plugins</h1>
        <p {...stylex.props(styles.description)}>
          Inspect the active App Generation, resolved Plugin packages, and
          current Host evidence.
        </p>

        <div {...stylex.props(styles.workspace)}>
          <Surface
            {...stylex.props(styles.panel)}
            level="panel"
            style={{ alignItems: "stretch", gap: 0, padding: 0 }}
          >
            <div {...stylex.props(styles.panelHeader)}>
              <h2 {...stylex.props(styles.panelTitle)}>Active generation</h2>
              <span {...stylex.props(styles.panelMeta)}>
                {plugins.length} plugins
              </span>
            </div>
            <div aria-hidden="true" {...stylex.props(styles.columns)}>
              <span>Plugin</span>
              <span>Resolved package</span>
              <span>Version</span>
              <span>State</span>
            </div>
            {plugins.length === 0 ? (
              <p {...stylex.props(styles.empty)}>
                No Plugins are present in this generation.
              </p>
            ) : (
              plugins.map((plugin) => (
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
                      {shortPluginDigest(plugin.receiptDigest)}
                    </span>
                  </span>
                  <span {...stylex.props(styles.ellipsis)}>
                    {plugin.packageId}
                  </span>
                  <span>{plugin.packageVersion}</span>
                  <StatusMarker
                    presentation="label"
                    status={stateStatus(plugin.state)}
                  >
                    {stateLabel(plugin.state)}
                  </StatusMarker>
                </button>
              ))
            )}
          </Surface>

          <Surface
            {...stylex.props(styles.panel)}
            level="panel"
            style={{ alignItems: "stretch", gap: 0, padding: 0 }}
          >
            {selected && projection ? (
              <>
                <header {...stylex.props(styles.inspectorHeader)}>
                  <div>
                    <h2 {...stylex.props(styles.inspectorTitle)}>
                      {selected.instanceKey}
                    </h2>
                    <span {...stylex.props(styles.secondary)}>
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
                <div {...stylex.props(styles.inspectorBody)}>
                  <DetailSection title="Resolved package">
                    <Detail label="Package" value={selected.packageId} />
                    <Detail label="Version" value={selected.packageVersion} />
                    <Detail
                      label="Receipt"
                      value={shortPluginDigest(selected.receiptDigest)}
                    />
                  </DetailSection>
                  <DetailSection title="App Generation">
                    <Detail
                      label="Generation"
                      value={projection.generation.generationId}
                    />
                    <Detail
                      label="Plan"
                      value={shortPluginDigest(
                        projection.generation.planDigest
                      )}
                    />
                    <Detail
                      label="Activated"
                      value={formatTimestamp(projection.generation.activatedAt)}
                    />
                  </DetailSection>
                  <DetailSection title="Provided capabilities">
                    {selected.capabilityIds.map((capability) => (
                      <code
                        key={capability}
                        {...stylex.props(styles.capability)}
                      >
                        {capability}
                      </code>
                    ))}
                  </DetailSection>
                  <DetailSection title="Live evidence">
                    <Detail
                      label="Observed"
                      value={formatTimestamp(projection.observedAt)}
                    />
                    <Detail
                      label="Cursor"
                      value={String(projection.stream.cursor)}
                    />
                  </DetailSection>
                </div>
              </>
            ) : (
              <p {...stylex.props(styles.empty)}>
                Select a Plugin to inspect its receipt.
              </p>
            )}
          </Surface>
        </div>
      </div>
    </div>
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
      <dl {...stylex.props(styles.fields)}>{children}</dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.field)}>
      <dt {...stylex.props(styles.term)}>{label}</dt>
      <dd {...stylex.props(styles.value)}>{value}</dd>
    </div>
  );
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

function streamLabel(
  state: ReturnType<typeof usePluginWorkbench>["streamState"]
) {
  if (state === "live") {
    return "Streaming";
  }
  if (state === "connecting") {
    return "Connecting";
  }
  if (state === "reconnecting") {
    return "Reconnecting";
  }
  return "Snapshot";
}

function formatTimestamp(value: string) {
  return `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
