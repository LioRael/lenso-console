import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { Link, useSearch } from "@tanstack/react-router";
import { FolderOpen, History, Plus } from "lucide-react";

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
      <AgentProjectPicker agentId={agentId} path={path}>
        <FolderOpen aria-hidden="true" size={compact ? 14 : 20} />
        <div {...stylex.props(styles.projectCopy)} title={path}>
          <span {...stylex.props(styles.projectName)}>{name}</span>
          {compact ? null : <span {...stylex.props(styles.path)}>{path}</span>}
        </div>
      </AgentProjectPicker>
      {compact ? null : (
        <div {...stylex.props(styles.actions)}>
          <Link
            {...stylex.props(styles.newTask)}
            params={{ agentId, chatId: "new-task" }}
            search={{ project: projectId }}
            to="/agent/$agentId/$chatId"
          >
            <Plus aria-hidden="true" size={14} />
            New task
          </Link>
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
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "16px",
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
  projectCopy: { display: "grid", flex: "1 1 auto", gap: "3px", minWidth: 0 },
  projectName: {
    color: "var(--color-content-primary)",
    fontSize: "12px",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  path: { fontSize: "11px", overflowWrap: "anywhere" },
  actions: { alignItems: "center", display: "flex", gap: "8px" },
  newTask: {
    alignItems: "center",
    borderRadius: "var(--radius-control)",
    color: "var(--color-content-primary)",
    display: "inline-flex",
    fontSize: "12px",
    gap: "5px",
    padding: "6px 8px",
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-surface-interactive-hover)",
    },
  },
});
