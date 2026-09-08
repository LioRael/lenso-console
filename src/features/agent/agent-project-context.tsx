import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useSearch } from "@tanstack/react-router";
import { FolderOpen, History } from "lucide-react";

import { AgentHistoryMenu } from "./agent-history-menu";
import { AgentProjectPicker } from "./agent-project-picker";

export function AgentProjectContext({
  agentId,
  path,
  compact = false,
}: {
  agentId: string;
  path: string;
  compact?: boolean;
}) {
  const search = useSearch({ strict: false });
  const projectId = agentId === "app" ? search.project : undefined;
  const name =
    path
      .replace(/[\\/]+$/u, "")
      .split(/[\\/]/u)
      .at(-1) || path;
  return (
    <section
      aria-label="Agent working directory"
      {...stylex.props(styles.project, compact && styles.projectCompact)}
    >
      <AgentProjectPicker agentId={agentId} path={path} compact={compact}>
        <span {...stylex.props(!compact && styles.folder)}>
          <FolderOpen aria-hidden="true" size={16} strokeWidth={1.5} />
        </span>
        <div {...stylex.props(styles.projectCopy)} title={path}>
          <span {...stylex.props(styles.projectName)}>{name}</span>
          {compact ? null : <span {...stylex.props(styles.path)}>{path}</span>}
        </div>
      </AgentProjectPicker>
      {compact ? null : (
        <div {...stylex.props(styles.actions)}>
          <AgentHistoryMenu
            projectId={projectId}
            agentId={agentId}
            showNewChat={false}
          >
            <Button size="compact" variant="ghost">
              <History aria-hidden="true" size={14} />
              Resume task
            </Button>
          </AgentHistoryMenu>
        </div>
      )}
    </section>
  );
}

const styles = stylex.create({
  project: {
    alignItems: "center",
    color: "var(--color-content-secondary)",
    display: "flex",
    flexWrap: "nowrap",
    gap: "12px",
    marginBottom: "12px",
    minWidth: 0,
    width: "100%",
  },
  projectCompact: {
    flexWrap: "nowrap",
    gap: "6px",
    marginBottom: 0,
    maxWidth: { default: "180px", "@media (max-width: 760px)": "90px" },
    width: "auto",
  },
  folder: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 8,
    backgroundColor: "var(--color-surface-selected)",
  },
  projectCopy: { display: "grid", flex: "1 1 auto", gap: "3px", minWidth: 0 },
  projectName: {
    color: "var(--color-content-primary)",
    fontSize: "12px",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  path: {
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--color-content-tertiary)",
  },
  actions: { alignItems: "center", display: "flex", gap: "8px" },
});
