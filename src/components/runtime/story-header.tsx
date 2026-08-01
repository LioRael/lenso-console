import { X } from "lucide-react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import { formatRuntimeDuration } from "../../lib/runtime-style";
import { buildRuntimeStory } from "../../lib/story";
import { HorizontalScrollArea } from "./horizontal-tab-scroll";
import { buildParallelExecutionGroups } from "./parallel-execution-model";
import { RuntimeStatusBadge } from "./runtime-status-badge";

export function StoryHeader({
  onClose,
  onSelectNode,
  story,
}: {
  onClose: () => void;
  story: RuntimeStory;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const storySummary = buildRuntimeStory(story);
  const [strongestParallelGroup] = buildParallelExecutionGroups(story).sort(
    (left, right) =>
      right.branchCount - left.branchCount || left.startMs - right.startMs
  );
  const isError =
    storySummary.status === "failed" || storySummary.status === "dead";

  return (
    <header className="h-28 min-w-0 overflow-hidden border-b border-(--line-subtle) bg-(--bg-canvas)">
      <div className="flex h-9 min-w-0 items-start gap-3 px-3.5 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 truncate text-[16px] font-semibold leading-tight text-(--foreground)">
              {storySummary.title}
            </h1>
            <RuntimeStatusBadge status={storySummary.status} variant="label" />
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-3 font-mono text-[10px] text-(--fg-secondary)">
            <Metric tone="accent">
              {formatRuntimeDuration(storySummary.duration)}
            </Metric>
            <Metric>{storySummary.nodeCount} nodes</Metric>
            <Metric tone={storySummary.errorCount > 0 ? "error" : "muted"}>
              {storySummary.errorCount} errors
            </Metric>
            <Metric>{storySummary.services.length} services</Metric>
            {strongestParallelGroup ? (
              <Metric tone="accent">
                fan-out {strongestParallelGroup.branchCount}
              </Metric>
            ) : null}
          </div>
        </div>

        <button
          aria-label="Close story detail"
          className="grid size-5 shrink-0 place-items-center rounded-xs text-(--muted) transition hover:bg-(--hover) hover:text-(--foreground)"
          onClick={onClose}
          type="button"
        >
          <X size={13} />
        </button>
      </div>

      <div className="h-6 min-w-0 px-3.5">
        <HorizontalScrollArea className="h-5" viewportClassName="h-full">
          <div className="flex h-full w-max min-w-full items-center gap-1.5">
            {storySummary.services.map((service) => (
              <span
                className="shrink-0 px-0.5 font-mono text-[10px] text-(--fg-secondary)"
                key={service}
              >
                {service}
              </span>
            ))}
          </div>
        </HorizontalScrollArea>
      </div>

      <div className="flex h-4 min-w-0 items-center gap-x-2 overflow-hidden px-3.5 font-mono text-[9px]">
        <span className="min-w-0 truncate text-(--secondary)">
          {storySummary.patternLabel || "No execution pattern"}
        </span>
        <span className="text-(--muted-deep)">·</span>
        <span className="min-w-0 truncate text-(--muted)">
          {storySummary.correlationId}
        </span>
        {storySummary.rootError ? (
          <>
            <span className="text-(--muted-deep)">·</span>
            <button
              className={cn(
                "min-w-0 truncate text-left text-(--tone-error-fg) transition hover:text-(--error)",
                isError && "font-semibold"
              )}
              onClick={() => {
                const errorNode = lastErrorNode(storySummary.nodes);
                if (errorNode) {
                  onSelectNode(errorNode.node);
                }
              }}
              type="button"
            >
              {storySummary.rootError}
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}

function lastErrorNode(nodes: ReturnType<typeof buildRuntimeStory>["nodes"]) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.error) {
      return node;
    }
  }

  return null;
}

function Metric({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "accent" | "error" | "muted";
}) {
  const toneClass = {
    accent: "text-(--accent)",
    error: "text-(--tone-error-fg)",
    muted: "text-(--secondary)",
  }[tone];

  return (
    <span className={cn("inline-flex items-center", toneClass)}>
      {children}
    </span>
  );
}
