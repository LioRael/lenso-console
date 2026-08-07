import type {
  RuntimeStatus,
  RuntimeStory,
  ExecutionNode,
} from "../data/mock-runtime";

const semanticServiceColors: Record<string, string> = {
  billing: "var(--tone-warning-fg)",
  console: "var(--tone-success-fg)",
  customer: "var(--tone-info-fg)",
  ledger: "var(--tone-success-fg)",
};

export function formatRuntimeDuration(ms: number) {
  if (ms < 1) {
    return `${Math.round(ms * 1000)}us`;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const seconds = ms / 1000;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (remainingSeconds === 60) {
      return `${minutes + 1}m`;
    }
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const precision = seconds >= 10 ? 1 : 2;
  return `${Number(seconds.toFixed(precision))}s`;
}

export function statusColor(status: RuntimeStatus) {
  if (status === "failed" || status === "dead") {
    return "var(--error)";
  }
  if (status === "pending" || status === "processing" || status === "running") {
    return "var(--warning)";
  }
  return "var(--success)";
}

export function serviceColor(service: string) {
  const semanticColor = semanticServiceColors[service.toLowerCase()];
  if (semanticColor) {
    return semanticColor;
  }

  return "var(--fg-secondary)";
}

export function runtimeStoryStats(story: RuntimeStory) {
  const errors = story.nodes.filter(
    (node) => node.status === "failed" || node.status === "dead"
  );
  const services = Array.from(new Set(story.nodes.map((node) => node.service)));
  return {
    errors: errors.length,
    services,
    nodeCount: story.nodes.length,
  };
}

export function runtimeTimelineEnd(story: RuntimeStory) {
  const latestNodeEnd = Math.max(
    0,
    ...story.nodes.map((node) => node.startMs + node.durationMs)
  );
  return Math.max(story.durationMs, latestNodeEnd, 1);
}

export type TimelineSegmentLayout = {
  left: number;
  width: number;
};

export function timelineSegmentLayout({
  durationMs,
  minWidthPercent,
  startMs,
  timelineEnd,
}: {
  durationMs: number;
  minWidthPercent: number;
  startMs: number;
  timelineEnd: number;
}): TimelineSegmentLayout {
  const left = clampPercent((startMs / timelineEnd) * 100);
  const rawWidth = (durationMs / timelineEnd) * 100;
  const remainingWidth = Math.max(0, 100 - left);
  const width = Math.min(Math.max(rawWidth, minWidthPercent), remainingWidth);
  return { left, width };
}

export function nodeDepth(node: ExecutionNode, nodes: ExecutionNode[]) {
  let depth = 0;
  let { parentId } = node;
  while (parentId) {
    const currentParentId = parentId;
    const parent = nodes.find((item) => item.id === currentParentId);
    if (!parent) {
      break;
    }
    depth += 1;
    ({ parentId } = parent);
  }
  return depth;
}

export function criticalPath(story: RuntimeStory) {
  const byParent = new Map<string | undefined, ExecutionNode[]>();
  story.nodes.forEach((node) => {
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
  });

  const path: ExecutionNode[] = [];
  const roots = [...(byParent.get(undefined) ?? [])].sort(
    (left, right) => right.durationMs - left.durationMs
  );
  let [current] = roots;

  while (current) {
    path.push(current);
    const children = [...(byParent.get(current.id) ?? [])].sort(
      (left, right) => right.durationMs - left.durationMs
    );
    [current] = children;
  }

  return path;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
