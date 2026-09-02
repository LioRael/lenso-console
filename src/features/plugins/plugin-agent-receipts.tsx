import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";

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

export function PluginAgentReceipts({
  agentId,
  tools,
}: {
  agentId: string;
  tools: readonly AgentToolCall[];
}) {
  const receipts = tools.flatMap((tool) => {
    const receipt = decodeAgentPluginReceipt(tool);
    return receipt ? [receipt] : [];
  });
  if (receipts.length === 0) {
    return null;
  }
  return (
    <div aria-label="Plugin change receipts" {...stylex.props(styles.list)}>
      {receipts.map((receipt) => (
        <PluginAgentReceiptCard
          agentId={agentId}
          key={`${receipt.kind}:${receipt.proposalDigest}`}
          receipt={receipt}
        />
      ))}
    </div>
  );
}

function PluginAgentReceiptCard({
  agentId,
  receipt,
}: {
  agentId: string;
  receipt: AgentPluginReceipt;
}) {
  const navigate = useNavigate();
  const { requestWorkbench } = usePluginAgentWorkbench();
  const ready = receipt.kind === "proposal" && receipt.status === "ready";
  const Icon =
    ready || receipt.kind === "publication" ? ShieldCheck : CircleAlert;
  const title = receiptTitle(receipt);
  const description = receiptDescription(receipt);
  const openWorkbench = () => {
    requestWorkbench({
      agentId,
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
      {ready || receipt.kind === "publication" ? (
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

function receiptTitle(receipt: AgentPluginReceipt) {
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

function receiptDescription(receipt: AgentPluginReceipt) {
  const authority = `${authorityLabel(receipt.authority.kind)} · ${receipt.authority.reference}`;
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
