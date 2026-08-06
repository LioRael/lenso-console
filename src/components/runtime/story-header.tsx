import { stylexClassName } from "@lenso/console-ui";
import { X } from "lucide-react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
} from "../../lib/runtime-style";
import { buildRuntimeStory } from "../../lib/story";
import { HorizontalScrollArea } from "./horizontal-tab-scroll";
import { buildParallelExecutionGroups } from "./parallel-execution-model";

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
    <header
      className={stylexClassName(
        "flex h-[112px] min-w-0 flex-col gap-1 overflow-hidden border-b border-(--line-subtle) bg-(--bg-canvas) px-3.5 pt-2.5 pb-2"
      )}
    >
      <div
        className={stylexClassName(
          "flex h-[22px] min-w-0 items-center gap-2 overflow-hidden"
        )}
      >
        <h1
          className={stylexClassName(
            "min-w-0 truncate text-[16px] font-semibold leading-[22px] text-(--foreground)"
          )}
        >
          {storySummary.title}
        </h1>
        <span
          className={stylexClassName(
            "inline-flex shrink-0 items-center gap-1.5 font-sans text-[10px] text-(--fg-secondary)"
          )}
        >
          <span
            className={stylexClassName("size-1.5 rounded-full")}
            style={{ backgroundColor: statusColor(storySummary.status) }}
          />
          {storySummary.status}
        </span>
        <span className={stylexClassName("min-w-0 flex-1")} />
        <button
          aria-label="Close story detail"
          className={stylexClassName(
            "grid size-[13px] shrink-0 place-items-center rounded-xs text-(--muted) transition hover:bg-(--hover) hover:text-(--foreground)"
          )}
          onClick={onClose}
          type="button"
        >
          <X size={13} />
        </button>
      </div>

      <div
        className={stylexClassName(
          "flex h-[14px] min-w-0 items-center gap-3 overflow-hidden font-mono text-[10px] text-(--fg-secondary)"
        )}
      >
        <Metric tone="muted">
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

      <div
        className={stylexClassName(
          "flex h-[20px] min-w-0 items-center gap-1.5 overflow-hidden"
        )}
      >
        <HorizontalScrollArea
          className={stylexClassName("h-5 min-w-0 flex-1")}
          viewportClassName="h-full"
        >
          <div
            className={stylexClassName(
              "flex h-full w-max min-w-full items-center gap-1.5"
            )}
          >
            {storySummary.services.map((service) => (
              <span
                className={stylexClassName("shrink-0 font-mono text-[8.5px]")}
                key={service}
                style={{ color: serviceColor(service) }}
              >
                {service}
              </span>
            ))}
          </div>
        </HorizontalScrollArea>
      </div>

      <div
        className={stylexClassName(
          "flex h-4 min-w-0 items-center justify-between gap-3 overflow-hidden font-mono text-[9px]"
        )}
      >
        <div
          className={stylexClassName(
            "flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden"
          )}
        >
          <span
            className={stylexClassName(
              "min-w-0 truncate text-(--fg-secondary)"
            )}
          >
            {storySummary.patternLabel || "No execution pattern"}
          </span>
          {storySummary.rootError ? (
            <>
              <span className={stylexClassName("text-(--muted-deep)")}>·</span>
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
        <span
          className={stylexClassName("shrink-0 truncate text-(--fg-tertiary)")}
        >
          {storySummary.correlationId}
        </span>
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
    <span className={cn("inline-flex shrink-0 items-center", toneClass)}>
      {children}
    </span>
  );
}
