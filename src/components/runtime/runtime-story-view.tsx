import {
  AlertTriangle,
  Check,
  Cloud,
  Mail,
  Play,
  RefreshCcw,
  Route,
  ServerCog,
  Workflow,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { retryTargetForNode } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import { formatRuntimeDuration } from "../../lib/runtime-style";
import {
  buildRuntimeStory,
  runtimeStatusIntent,
  type RuntimeNode,
  type RuntimeNodeType,
} from "../../lib/story";
import { Button } from "../ui/button";
import { RuntimeViewHeader } from "./runtime-view-header";

export function RuntimeStoryView({
  selectedNodeId,
  story,
  onRetryNode,
  onSelectNode,
}: {
  story: RuntimeStory;
  selectedNodeId: string | null;
  onSelectNode: (node: ExecutionNode) => void;
  onRetryNode: (node: RuntimeNode) => void;
}) {
  const storySummary = buildRuntimeStory(story);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas)">
      <RuntimeViewHeader
        meta={`${storySummary.nodeCount} nodes · ${formatRuntimeDuration(storySummary.duration)}`}
        summary={storySummary.patternLabel || "No execution pattern"}
        title="Runtime Story"
      />

      <div className="min-h-0 overflow-auto px-4 py-4">
        <div className="mx-auto grid w-full max-w-4xl gap-2">
          {storySummary.nodes.length === 0 ? (
            <div className="border border-(--line) bg-(--bg-panel) p-4 font-mono text-xs text-(--fg-tertiary)">
              No runtime story nodes were derived for this story.
            </div>
          ) : null}

          {storySummary.nodes.map((node, index) => (
            <GraphNode
              key={node.id}
              node={node}
              onRetry={() => onRetryNode(node)}
              onSelect={() => onSelectNode(node.node)}
              selected={selectedNodeId === node.node.id}
              showConnector={index < storySummary.nodes.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GraphNode({
  node,
  selected,
  showConnector,
  onRetry,
  onSelect,
}: {
  node: RuntimeNode;
  selected: boolean;
  showConnector: boolean;
  onSelect: () => void;
  onRetry: () => void;
}) {
  const type = nodeStyle[node.type];
  const status = statusStyle[runtimeStatusIntent(node.status)];
  const Icon = type.icon;
  const StatusIcon = status.icon;
  const retryable = retryTargetForNode(node.node) !== null;

  return (
    <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3">
      <div className="relative flex justify-center">
        <span
          className={cn(
            "relative z-10 mt-1 grid size-9 place-items-center border bg-(--bg-panel)",
            type.iconClass,
            selected && "ring-1 ring-(--line-strong)"
          )}
        >
          <Icon size={16} strokeWidth={1.8} />
          <span
            className={cn(
              "-right-1 -bottom-1 absolute grid size-4 place-items-center rounded-full border border-(--bg-canvas)",
              status.badgeClass
            )}
            title={status.label}
          >
            <StatusIcon size={10} strokeWidth={2.2} />
          </span>
        </span>
        {showConnector ? (
          <span className="absolute top-11 bottom-[-0.5rem] w-px bg-[linear-gradient(180deg,var(--line)_0%,var(--line)_100%)]" />
        ) : null}
      </div>

      <div
        className={cn(
          "group relative min-w-0 border bg-(--bg-panel) px-3 py-2.5 text-left shadow-(--elevation-raised) transition hover:border-(--line) hover:bg-(--bg-control)",
          type.cardClass,
          selected && "border-(--line-strong) bg-(--bg-row-hover)",
          (node.status === "failed" || node.status === "dead") &&
            "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--error)_20%,transparent),var(--elevation-raised)]"
        )}
      >
        <button
          aria-label={`Select ${node.typeLabel} ${node.name}`}
          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          onClick={onSelect}
          type="button"
        />
        <span className="flex min-w-0 items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "shrink-0 border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                  type.labelClass
                )}
              >
                {node.typeLabel}
              </span>
              <span className={cn("font-mono text-[10px]", status.textClass)}>
                {status.label}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-(--fg-tertiary)">
                {formatRuntimeDuration(node.duration)}
              </span>
            </span>
            <span className="mt-1.5 block truncate text-[14px] font-semibold text-(--fg-primary)">
              {node.name}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[10px] text-(--fg-tertiary)">
              <span className="truncate">{node.service}</span>
              <span className="text-(--fg-quaternary)">·</span>
              <span className="shrink-0" title={node.id}>
                {shortId(node.id)}
              </span>
            </span>
            {node.error ? (
              <span className="mt-2 block truncate font-mono text-[11px] text-[var(--tone-error-fg)]">
                {node.error}
              </span>
            ) : null}
          </span>

          {retryable ? (
            <span className="relative z-10 shrink-0">
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry();
                }}
                variant="danger"
              >
                <RefreshCcw size={13} />
                Retry
              </Button>
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function shortId(id: string) {
  const tail = id.split("-").at(-1) ?? id;
  return tail.length > 12 ? `…${tail.slice(-12)}` : `…${tail}`;
}

const nodeStyle: Record<
  RuntimeNodeType,
  {
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    iconClass: string;
    cardClass: string;
    labelClass: string;
  }
> = {
  event: {
    cardClass: "tint-border tint-info",
    icon: Mail,
    iconClass: "border-dashed tint-border tint-text tint-info",
    labelClass: "tint tint-info",
  },
  external: {
    cardClass: "tint-border tint-error",
    icon: Cloud,
    iconClass: "tint-border tint-text tint-error",
    labelClass: "tint tint-error",
  },
  function: {
    cardClass: "tint-border tint-success",
    icon: Workflow,
    iconClass: "tint-border tint-text tint-success",
    labelClass: "tint tint-success",
  },
  request: {
    cardClass: "tint-border tint-info",
    icon: Route,
    iconClass: "tint-border tint-text tint-info",
    labelClass: "tint tint-info",
  },
  worker: {
    cardClass: "tint-border tint-warning",
    icon: ServerCog,
    iconClass: "border-double tint-border tint-text tint-warning",
    labelClass: "tint tint-warning",
  },
};

const statusStyle: Record<
  ReturnType<typeof runtimeStatusIntent>,
  {
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    label: string;
    badgeClass: string;
    textClass: string;
  }
> = {
  dead: {
    badgeClass: "bg-(--error) text-white",
    icon: XCircle,
    label: "dead",
    textClass: "text-[var(--tone-error-fg)]",
  },
  failed: {
    badgeClass: "bg-(--warning) text-white",
    icon: AlertTriangle,
    label: "failed",
    textClass: "tint-text tint-warning",
  },
  retrying: {
    badgeClass: "bg-(--info) text-white",
    icon: RefreshCcw,
    label: "retrying",
    textClass: "tint-text tint-info",
  },
  running: {
    badgeClass: "bg-(--info) text-white",
    icon: Play,
    label: "running",
    textClass: "tint-text tint-info",
  },
  success: {
    badgeClass: "bg-(--success) text-white",
    icon: Check,
    label: "success",
    textClass: "tint-text tint-success",
  },
};
