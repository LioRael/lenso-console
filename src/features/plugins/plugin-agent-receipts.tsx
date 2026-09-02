import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  CircleAlert,
  ExternalLink,
  List,
  Search,
  ShieldCheck,
} from "lucide-react";

import type { AgentToolCall } from "../agent/agent-runtime";
import {
  decodeAgentPluginReceipt,
  type AgentPluginReceipt,
} from "./plugin-agent-receipt";
import { usePluginAgentWorkbench } from "./plugin-agent-workbench-context";

const styles = stylex.create({
  action: { justifySelf: "start", marginTop: 2 },
  card: {
    backgroundColor: "var(--color-surface-secondary)",
    borderColor: "var(--color-border-tertiary)",
    borderRadius: "var(--radius-control)",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: 6,
    padding: "10px 12px",
  },
  description: {
    color: "var(--color-content-secondary)",
    fontSize: 12,
    lineHeight: "17px",
    margin: 0,
  },
  diagnostic: {
    alignItems: "start",
    color: "var(--color-status-warning-content)",
    display: "grid",
    fontSize: 12,
    gap: 6,
    gridTemplateColumns: "14px minmax(0, 1fr)",
    lineHeight: "17px",
  },
  identity: {
    color: "var(--color-content-tertiary)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  list: { display: "grid", gap: 6, margin: "1px 8px 14px" },
  title: {
    alignItems: "center",
    color: "var(--color-content-primary)",
    display: "flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 7,
    lineHeight: "17px",
  },
});

type AgentPluginInspectionReceipt = Extract<
  AgentPluginReceipt,
  { kind: "app_inspection" | "plugin_inspection" | "plugin_list" }
>;
type AgentPluginChangeReceipt = Extract<
  AgentPluginReceipt,
  { kind: "proposal" | "publication" | "selection" }
>;

export function PluginAgentReceipts({
  tools,
}: {
  tools: readonly AgentToolCall[];
}) {
  const receipts = tools.flatMap((tool) => {
    const receipt = decodeAgentPluginReceipt(tool);
    return receipt ? [{ callId: tool.callId, receipt }] : [];
  });
  if (receipts.length === 0) {
    return null;
  }
  return (
    <div aria-label="Plugin management receipts" {...stylex.props(styles.list)}>
      {receipts.map(({ callId, receipt }) => (
        <PluginAgentReceiptCard key={callId} receipt={receipt} />
      ))}
    </div>
  );
}

function PluginAgentReceiptCard({ receipt }: { receipt: AgentPluginReceipt }) {
  if (
    receipt.kind === "app_inspection" ||
    receipt.kind === "plugin_list" ||
    receipt.kind === "plugin_inspection"
  ) {
    return <PluginInspectionReceiptCard receipt={receipt} />;
  }
  return <PluginChangeReceiptCard receipt={receipt} />;
}

function PluginChangeReceiptCard({
  receipt,
}: {
  receipt: AgentPluginChangeReceipt;
}) {
  const navigate = useNavigate();
  const { requestWorkbench } = usePluginAgentWorkbench();
  const ready = receipt.kind === "proposal" && receipt.status === "ready";
  const Icon =
    ready || receipt.kind === "publication" || receipt.kind === "selection"
      ? ShieldCheck
      : CircleAlert;
  const title = receiptTitle(receipt);
  const description = receiptDescription(receipt);
  const openWorkbench = () => {
    requestWorkbench({
      agentId: receipt.agentId,
      ...(ready
        ? {
            draftReview: {
              baseRevision: receipt.baseRevision,
              baseSourceDigest: receipt.baseSourceDigest,
              configurationToml: receipt.configurationToml,
              proposalDigest: receipt.proposalDigest,
            },
          }
        : {}),
      instanceKey: receipt.instanceKey,
      packageId: receipt.packageId,
    });
    navigate({ to: "/plugins" });
  };
  return (
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.title)}>
        <Icon aria-hidden="true" size={14} strokeWidth={1.7} />
        {title}
      </div>
      <div {...stylex.props(styles.identity)}>
        {receipt.packageId}/{receipt.instanceKey}
      </div>
      <p {...stylex.props(styles.description)}>{description}</p>
      {receipt.kind === "proposal" && receipt.diagnostics.length > 0 ? (
        <div role="alert" {...stylex.props(styles.diagnostic)}>
          <CircleAlert aria-hidden="true" size={14} strokeWidth={1.7} />
          <span>{receipt.diagnostics[0]?.detail}</span>
        </div>
      ) : null}
      {ready ||
      receipt.kind === "publication" ||
      receipt.kind === "selection" ? (
        <Button
          onClick={openWorkbench}
          size="compact"
          variant="secondary"
          xstyle={styles.action}
        >
          <ExternalLink aria-hidden="true" size={13} strokeWidth={1.7} />
          {ready ? "Review in Plugins" : "View Plugin"}
        </Button>
      ) : null}
    </section>
  );
}

function PluginInspectionReceiptCard({
  receipt,
}: {
  receipt: AgentPluginInspectionReceipt;
}) {
  const navigate = useNavigate();
  const { requestWorkbench } = usePluginAgentWorkbench();
  const openWorkbench = () => {
    if (receipt.kind === "plugin_inspection") {
      const onlyInstance =
        receipt.instances.length === 1 ? receipt.instances[0] : undefined;
      requestWorkbench({
        agentId: receipt.agentId,
        ...(onlyInstance ? { instanceKey: onlyInstance.instanceKey } : {}),
        intent: "inspection",
        packageId: receipt.packageId,
      });
    } else {
      requestWorkbench({ agentId: receipt.agentId });
    }
    navigate({ to: "/plugins" });
  };
  const Icon = inspectionIcon(receipt);
  return (
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.title)}>
        <Icon aria-hidden="true" size={14} strokeWidth={1.7} />
        {inspectionTitle(receipt)}
      </div>
      <div
        {...stylex.props(styles.identity)}
        title={inspectionIdentityTitle(receipt)}
      >
        {inspectionIdentity(receipt)}
      </div>
      <p {...stylex.props(styles.description)}>
        {inspectionDescription(receipt)}
      </p>
      <Button
        onClick={openWorkbench}
        size="compact"
        variant="secondary"
        xstyle={styles.action}
      >
        <ExternalLink aria-hidden="true" size={13} strokeWidth={1.7} />
        {receipt.kind === "plugin_inspection" ? "View Plugin" : "Open Plugins"}
      </Button>
    </section>
  );
}

function inspectionIcon(receipt: AgentPluginInspectionReceipt) {
  if (receipt.kind === "app_inspection") {
    return Boxes;
  }
  return receipt.kind === "plugin_list" ? List : Search;
}

function inspectionTitle(receipt: AgentPluginInspectionReceipt) {
  if (receipt.kind === "app_inspection") {
    return "App Plugin state inspected";
  }
  return receipt.kind === "plugin_list"
    ? "Plugin catalog inspected"
    : "Plugin inspected";
}

function inspectionIdentity(receipt: AgentPluginInspectionReceipt) {
  if (receipt.kind === "plugin_inspection") {
    return receipt.packageId;
  }
  if (receipt.kind === "plugin_list" && receipt.query) {
    return `Query · ${receipt.query}`;
  }
  return `Revision · ${shortRevision(receipt.revision)}`;
}

function inspectionIdentityTitle(receipt: AgentPluginInspectionReceipt) {
  return receipt.kind === "plugin_inspection"
    ? `${receipt.packageId}@${receipt.packageRevision}`
    : receipt.revision;
}

function inspectionDescription(receipt: AgentPluginInspectionReceipt) {
  const authority = `${authorityLabel(receipt.authority.kind)} · ${receipt.authority.reference}`;
  if (receipt.kind === "app_inspection") {
    return `${authority} reports ${countLabel(receipt.pluginCount, "Plugin")}, ${countLabel(receipt.enabledInstanceCount, "enabled Instance")}, and ${countLabel(receipt.bindingCount, "binding")}.`;
  }
  if (receipt.kind === "plugin_list") {
    const scope = receipt.query ? ` matching “${receipt.query}”` : "";
    const packages = receipt.plugins
      .slice(0, 3)
      .map((plugin) => plugin.packageId);
    const examples =
      packages.length > 0
        ? ` ${packages.join(", ")}${receipt.plugins.length > packages.length ? ", …" : ""}.`
        : "";
    return `${authority} returned ${countLabel(receipt.plugins.length, "Plugin")}${scope}.${examples}`;
  }
  const enabled = receipt.instances.filter(
    (instance) => instance.selection === "enabled"
  ).length;
  const changed = receipt.instances.filter(
    (instance) => instance.hasRootDifference
  ).length;
  return `${authority} reports ${countLabel(receipt.instances.length, "Instance")}, ${enabled} enabled, and ${countLabel(changed, "Host difference")}.`;
}

function countLabel(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function shortRevision(revision: string) {
  return revision.length > 16 ? `${revision.slice(0, 16)}…` : revision;
}

function receiptTitle(receipt: AgentPluginChangeReceipt) {
  if (receipt.kind === "selection") {
    return receipt.enabled ? "Plugin enabled" : "Plugin disabled";
  }
  if (receipt.kind === "publication") {
    return "Plugin desired state published";
  }
  if (receipt.status === "ready") {
    return receipt.application === "noop"
      ? "Plugin configuration already matches"
      : "Plugin change ready for review";
  }
  return receipt.status === "rejected"
    ? "Plugin change rejected"
    : "Plugin change needs a decision";
}

function receiptDescription(receipt: AgentPluginChangeReceipt) {
  const authority = `${authorityLabel(receipt.authority.kind)} · ${receipt.authority.reference}`;
  if (receipt.kind === "selection") {
    return `${authority} changed the Plugin Instance selection to ${receipt.enabled ? "enabled" : "disabled"}.`;
  }
  if (receipt.kind === "publication") {
    return `${authority} accepted the reviewed proposal. Host reconciliation may still be pending.`;
  }
  if (receipt.status !== "ready") {
    return `${authority} did not admit this candidate for publication.`;
  }
  return receipt.application === "noop"
    ? `${authority} confirmed that no configuration change is required.`
    : `${authority} validated the candidate. Console will preview it again before publication.`;
}

function authorityLabel(kind: string) {
  if (kind === "local_plugin_root") {
    return "Plugin Root";
  }
  if (kind === "sqlite_configuration_store") {
    return "Console store";
  }
  return kind === "remote_configuration_service" ? "Remote service" : kind;
}
