import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search,
  Wrench,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { agentApiUrl } from "./agent-runtime";

type Project = { id: string; path: string };
type Directory = {
  path: string;
  parent: string | null;
  directories: string[];
  truncated: boolean;
};

async function request<T>(path: string, body?: { path: string }): Promise<T> {
  const response = await fetch(agentApiUrl("app", `projects${path}`), {
    headers: {
      "x-lenso-console-projects": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    throw new Error(error?.detail ?? "Projects are unavailable");
  }
  return response.json();
}

export function AgentProjectPicker({
  agentId,
  path,
  children,
  compact = false,
  onCodingSettings,
}: {
  agentId: string;
  path: string;
  children: ReactNode;
  compact?: boolean;
  onCodingSettings?: (() => void) | undefined;
}) {
  const directoryInputId = useId();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState(path);
  const [browsing, setBrowsing] = useState(path);
  const [busy, setBusy] = useState(false);
  const [projectError, setProjectError] = useState<string>();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const projects = useQuery({
    queryKey: ["local-projects", agentId],
    queryFn: () => request<{ projects: Project[]; defaultPath: string }>(""),
    enabled: agentId === "app",
    retry: false,
  });
  const listing = useQuery({
    queryKey: ["project-directories", browsing],
    queryFn: () =>
      request<Directory>(`/directories?path=${encodeURIComponent(browsing)}`),
    enabled: open,
    retry: false,
  });
  const choose = (project?: string) => {
    setOpen(false);
    navigate({
      to: "/agent/$agentId/$chatId",
      params: { agentId, chatId: "new-task" },
      search: { project },
    });
  };
  const openDirectory = async () => {
    if (
      directory.replace(/\/+$/u, "") ===
      projects.data?.defaultPath.replace(/\/+$/u, "")
    ) {
      choose();
      return;
    }
    setBusy(true);
    setProjectError(undefined);
    try {
      const project = await request<Project>("", { path: directory });
      await projects.refetch();
      choose(project.id);
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Could not open project"
      );
    } finally {
      setBusy(false);
    }
  };
  if (!projects.data) {
    return children;
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setFilter("");
          setDirectory(path);
          setBrowsing(path);
          setProjectError(undefined);
        }
      }}
    >
      <Dialog.Trigger
        render={
          <Button
            size="compact"
            variant="ghost"
            aria-label={`Change project: ${path}`}
            xstyle={[styles.trigger, !compact && styles.fullTrigger]}
          />
        }
      >
        {children}
        <ChevronDown aria-hidden="true" size={12} strokeWidth={1.5} />
      </Dialog.Trigger>
      <Dialog.Portal {...stylex.props(styles.portal)}>
        <Dialog.Backdrop xstyle={styles.backdrop} />
        <Dialog.Viewport xstyle={styles.viewport}>
          <Dialog.Popup xstyle={styles.popup}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Choose project</Dialog.Title>
                <Dialog.Description>
                  Each project keeps its own tasks. Tasks in other projects
                  continue running.
                </Dialog.Description>
              </div>
              <Dialog.Close disabled={busy} />
            </Dialog.Header>
            <Dialog.Body xstyle={styles.body}>
              {onCodingSettings ? (
                <div>
                  <Button
                    size="compact"
                    variant="ghost"
                    onClick={() => {
                      setOpen(false);
                      onCodingSettings();
                    }}
                  >
                    <Wrench aria-hidden="true" size={12} />
                    Coding settings
                  </Button>
                </div>
              ) : null}
              <section {...stylex.props(styles.section)}>
                <span {...stylex.props(styles.sectionLabel)}>
                  Opened projects
                </span>
                <div
                  {...stylex.props(styles.projects)}
                  aria-label="Opened projects"
                >
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => choose()}
                    aria-current={search.project ? undefined : "true"}
                    xstyle={[styles.row, !search.project && styles.current]}
                    aria-label={projects.data.defaultPath}
                  >
                    <FolderOpen
                      aria-hidden="true"
                      size={16}
                      strokeWidth={1.5}
                    />
                    <span {...stylex.props(styles.projectCopy)}>
                      <span {...stylex.props(styles.projectName)}>
                        {folderName(projects.data.defaultPath)}
                      </span>
                      <span {...stylex.props(styles.pathText)}>
                        {projects.data.defaultPath}
                      </span>
                    </span>
                    <span {...stylex.props(styles.badge)}>Default</span>
                    {search.project ? null : (
                      <Check aria-label="Current project" size={14} />
                    )}
                  </Button>
                  {projects.data.projects.map((project) => (
                    <Button
                      key={project.id}
                      variant="ghost"
                      disabled={busy}
                      onClick={() => choose(project.id)}
                      aria-current={
                        search.project === project.id ? "true" : undefined
                      }
                      xstyle={[
                        styles.row,
                        search.project === project.id && styles.current,
                      ]}
                      aria-label={project.path}
                    >
                      <FolderOpen
                        aria-hidden="true"
                        size={16}
                        strokeWidth={1.5}
                      />
                      <span {...stylex.props(styles.projectCopy)}>
                        <span {...stylex.props(styles.projectName)}>
                          {folderName(project.path)}
                        </span>
                        <span {...stylex.props(styles.pathText)}>
                          {project.path}
                        </span>
                      </span>
                      {search.project === project.id ? (
                        <Check aria-label="Current project" size={14} />
                      ) : null}
                    </Button>
                  ))}
                </div>
              </section>
              <section {...stylex.props(styles.section)}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setBrowsing(directory);
                    setFilter("");
                  }}
                  {...stylex.props(styles.pathForm)}
                >
                  <label
                    {...stylex.props(styles.sectionLabel)}
                    htmlFor={directoryInputId}
                  >
                    Choose a folder
                  </label>
                  <div {...stylex.props(styles.pathRow)}>
                    <Button
                      aria-label="Parent directory"
                      title="Parent directory"
                      variant="ghost"
                      disabled={busy || !listing.data?.parent}
                      onClick={() => {
                        const parent = listing.data?.parent;
                        if (parent) {
                          setDirectory(parent);
                          setBrowsing(parent);
                          setFilter("");
                        }
                      }}
                    >
                      <ArrowUp aria-hidden="true" size={14} />
                    </Button>
                    <input
                      id={directoryInputId}
                      value={directory}
                      onChange={(event) => setDirectory(event.target.value)}
                      placeholder="/path/to/project"
                      disabled={busy}
                      {...stylex.props(styles.input)}
                    />
                    <Button
                      type="submit"
                      disabled={busy || !directory.trim()}
                      variant="secondary"
                    >
                      Browse
                    </Button>
                  </div>
                </form>
                <div {...stylex.props(styles.browser)}>
                  <label {...stylex.props(styles.filter)}>
                    <Search aria-hidden="true" size={14} />
                    <input
                      aria-label="Filter folders"
                      placeholder="Filter folders…"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      {...stylex.props(styles.filterInput)}
                    />
                  </label>
                  <div
                    {...stylex.props(styles.directories)}
                    aria-label="Directories"
                  >
                    {listing.data?.directories
                      .filter((entry) =>
                        folderName(entry)
                          .toLowerCase()
                          .includes(filter.trim().toLowerCase())
                      )
                      .map((entry) => (
                        <Button
                          key={entry}
                          variant="ghost"
                          disabled={busy}
                          xstyle={styles.row}
                          onClick={() => {
                            setDirectory(entry);
                            setBrowsing(entry);
                            setFilter("");
                          }}
                        >
                          <FolderOpen
                            aria-hidden="true"
                            size={15}
                            strokeWidth={1.5}
                          />
                          <span {...stylex.props(styles.folderName)}>
                            {folderName(entry)}
                          </span>
                          <ChevronRight aria-hidden="true" size={12} />
                        </Button>
                      ))}
                    {listing.isPending ? (
                      <output {...stylex.props(styles.empty)}>
                        Loading folders…
                      </output>
                    ) : null}
                    {listing.data &&
                    !listing.data.directories.some((entry) =>
                      folderName(entry)
                        .toLowerCase()
                        .includes(filter.trim().toLowerCase())
                    ) ? (
                      <span {...stylex.props(styles.empty)}>
                        {filter
                          ? "No folders match your search."
                          : "No subfolders. You can use this folder."}
                      </span>
                    ) : null}
                    {listing.data?.truncated ? (
                      <span>
                        Directory listing is limited. Enter a full path to open
                        another folder.
                      </span>
                    ) : null}
                    {listing.error ? (
                      <p role="alert">{listing.error.message}</p>
                    ) : null}
                  </div>
                </div>
              </section>
              {projectError ? <p role="alert">{projectError}</p> : null}
            </Dialog.Body>
            <Dialog.Footer xstyle={styles.footer}>
              <div {...stylex.props(styles.selection)}>
                <span {...stylex.props(styles.sectionLabel)}>
                  Selected folder
                </span>
                <span title={directory} {...stylex.props(styles.selectedPath)}>
                  {directory || "Enter a directory path"}
                </span>
              </div>
              <Button
                disabled={busy || !directory.trim()}
                onClick={() => void openDirectory()}
              >
                {busy ? "Opening project…" : "Open project"}
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function folderName(path: string) {
  return path.replace(/\/+$/u, "").split("/").at(-1) || "/";
}

const styles = stylex.create({
  fullTrigger: {
    flex: "1 1 auto",
    justifyContent: "flex-start",
    height: "auto",
    padding: "8px",
    gap: 10,
    maxWidth: "100%",
  },
  section: { display: "grid", gap: 8, minWidth: 0 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-content-tertiary)",
  },
  projectCopy: { display: "grid", gap: 3, flex: 1, minWidth: 0 },
  projectName: {
    color: "var(--color-content-primary)",
    fontSize: 12,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pathText: {
    fontSize: 11,
    color: "var(--color-content-tertiary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    fontSize: 10,
    color: "var(--color-content-tertiary)",
    flexShrink: 0,
  },
  current: { backgroundColor: "var(--color-surface-selected)" },
  browser: {
    border: "1px solid var(--color-border-tertiary)",
    borderRadius: 10,
    overflow: "hidden",
  },
  filter: {
    outline: {
      default: "none",
      ":focus-within": "1px solid var(--color-border-secondary)",
    },
    outlineOffset: -1,
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    color: "var(--color-content-tertiary)",
    borderBottom: "1px solid var(--color-border-tertiary)",
  },
  filterInput: {
    border: "none",
    backgroundColor: "transparent",
    color: "var(--color-content-primary)",
    minWidth: 0,
    width: "100%",
    fontSize: 12,
    outline: "none",
  },
  folderName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    padding: "28px 12px",
    textAlign: "center",
    color: "var(--color-content-tertiary)",
    fontSize: 12,
  },
  footer: { justifyContent: "space-between", gap: 16 },
  selection: { display: "grid", gap: 4, minWidth: 0, flex: 1 },
  selectedPath: {
    fontSize: 11,
    color: "var(--color-content-tertiary)",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
  portal: { position: "relative", zIndex: 100 },
  trigger: { minWidth: 0, padding: "4px 6px", gap: "6px", textAlign: "left" },
  backdrop: { zIndex: 100 },
  viewport: { zIndex: 101 },
  popup: {
    width: "calc(100vw - 32px)",
    maxWidth: 580,
    maxHeight: "calc(100dvh - 32px)",
  },
  body: {
    display: "grid",
    gap: 20,
    fontSize: 12,
    minHeight: 0,
    overflowY: "auto",
  },
  projects: { display: "grid", gap: 2, maxHeight: 138, overflowY: "auto" },
  row: {
    borderRadius: 8,
    color: "var(--color-content-primary)",
    justifyContent: "flex-start",
    textAlign: "left",
    fontSize: 12,
    gap: 8,
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    height: "auto",
    minHeight: 34,
    padding: "8px 10px",
    width: "100%",
    flexShrink: 0,
  },
  pathForm: { display: "grid", gap: 6 },
  pathRow: { display: "flex", gap: 8 },
  input: {
    minWidth: 0,
    flex: 1,
    fontSize: 12,
    border: "1px solid var(--color-border-tertiary)",
    borderRadius: "var(--radius-control)",
    backgroundColor: "var(--color-surface-canvas)",
    color: "var(--color-content-primary)",
    padding: "6px 8px",
  },
  directories: {
    display: "flex",
    flexDirection: "column",
    height: 204,
    overflowY: "auto",
    padding: 4,
    gap: 1,
  },
});
